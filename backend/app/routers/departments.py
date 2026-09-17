from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..dependencies import get_current_admin, get_current_active_user
from ..integrations import trigger_n8n_event

router = APIRouter(prefix="/departments", tags=["departments"])


@router.get("", response_model=list[schemas.DepartmentRead])
def list_departments(db: Session = Depends(get_db), _: models.User = Depends(get_current_active_user)):
    return db.execute(select(models.Department)).scalars().all()


@router.post("", response_model=schemas.DepartmentRead, status_code=status.HTTP_201_CREATED)
def create_department(
    payload: schemas.DepartmentCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_admin),
):
    existing = (
        db.execute(select(models.Department).where(models.Department.name == payload.name))
        .scalar_one_or_none()
    )
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Department already exists")
    department = models.Department(name=payload.name)
    db.add(department)
    db.commit()
    db.refresh(department)
    serialized_department = schemas.DepartmentRead.model_validate(department).model_dump()
    background_tasks.add_task(trigger_n8n_event, "department.created", serialized_department)
    return department


@router.patch("/{department_id}", response_model=schemas.DepartmentRead)
def update_department(
    department_id: str,
    payload: schemas.DepartmentUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_admin),
):
    department = db.get(models.Department, department_id)
    if not department:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found")

    if payload.name is not None:
        department.name = payload.name

    db.commit()
    db.refresh(department)
    return department


@router.delete("/{department_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_department(
    department_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_admin),
):
    department = db.get(models.Department, department_id)
    if not department:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found")
    serialized_department = schemas.DepartmentRead.model_validate(department).model_dump()
    db.delete(department)
    db.commit()
    background_tasks.add_task(trigger_n8n_event, "department.deleted", serialized_department)

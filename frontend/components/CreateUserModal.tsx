import { useState, useMemo, useEffect, useCallback } from "react";
import api from "../services/mockApi";
import { Department, Role, AvatarAsset } from "../types";
import { useAuth } from "../hooks/useAuth";
import SingleSelect from "./ui/SingleSelect";
import AvatarPicker from "./AvatarPicker";
import { useAvatarLibrary } from "../hooks/useAvatarLibrary";
import { FRAME_OPTIONS, getFrameClassName, DEFAULT_FRAME_ID } from "../constants/avatarFrames";

type ThemeMode = "dark" | "colorful" | "light";

interface ThemeConfig {
  name: string;
  gradient: string;
  surface: string;
  sectionBorder: string;
  text: string;
  mutedText: string;
  placeholder: string;
  accent: string;
  accentSoft: string;
  input: string;
  inputHover: string;
  dropdown: string;
  chipBg: string;
  chipText: string;
  chipBorder: string;
  chipHover: string;
  ring: string;
  shadow: string;
  sectionShadow: string;
  glowOne: string;
  glowTwo: string;
}

const THEME_MODES: Record<ThemeMode, ThemeConfig> = {
  dark: {
    name: "Dark",
  gradient: "linear-gradient(135deg, rgba(248,250,252,0.95), rgba(226,232,240,0.92))",
    surface: "linear-gradient(160deg, rgba(255,255,255,0.96), rgba(241,245,249,0.92))",
    sectionBorder: "rgba(209, 213, 219, 0.5)",
    text: "#0f172a",
    mutedText: "rgba(30, 41, 59, 0.55)",
    placeholder: "rgba(100, 116, 139, 0.4)",
    accent: "#6b7280",
    accentSoft: "rgba(107,114,128,0.12)",
    input: "rgba(248,250,252,0.95)",
    inputHover: "rgba(255,255,255,1)",
    dropdown: "rgba(255,255,255,0.98)",
    chipBg: "rgba(229,231,235,0.5)",
    chipText: "#374151",
    chipBorder: "rgba(209,213,219,0.8)",
    chipHover: "rgba(209,213,219,0.3)",
    ring: "rgba(107,114,128,0.2)",
    shadow: "0 30px 80px rgba(148,163,184,0.2)",
    sectionShadow: "0 16px 40px rgba(148,163,184,0.15)",
    glowOne: "rgba(107,114,128,0.15)",
    glowTwo: "rgba(107,114,128,0.12)",
  },
  colorful: {
    name: "Colorful",
      gradient: "linear-gradient(135deg, rgba(248,250,252,0.95), rgba(226,232,240,0.92))",
    surface: "linear-gradient(160deg, rgba(255,255,255,0.96), rgba(241,245,249,0.92))",
    sectionBorder: "rgba(209, 213, 219, 0.5)",
    text: "#0f172a",
    mutedText: "rgba(30, 41, 59, 0.55)",
    placeholder: "rgba(100, 116, 139, 0.4)",
    accent: "#6b7280",
    accentSoft: "rgba(107,114,128,0.12)",
    input: "rgba(248,250,252,0.95)",
    inputHover: "rgba(255,255,255,1)",
    dropdown: "rgba(255,255,255,0.98)",
    chipBg: "rgba(229,231,235,0.5)",
    chipText: "#374151",
    chipBorder: "rgba(209,213,219,0.8)",
    chipHover: "rgba(209,213,219,0.3)",
    ring: "rgba(107,114,128,0.2)",
    shadow: "0 30px 80px rgba(148,163,184,0.2)",
    sectionShadow: "0 16px 40px rgba(148,163,184,0.15)",
    glowOne: "rgba(107,114,128,0.15)",
    glowTwo: "rgba(107,114,128,0.12)",
  },
  light: {
    name: "Light",
    gradient: "linear-gradient(135deg, rgba(248,250,252,0.95), rgba(226,232,240,0.92))",
    surface: "linear-gradient(160deg, rgba(255,255,255,0.96), rgba(241,245,249,0.92))",
    sectionBorder: "rgba(209, 213, 219, 0.5)",
    text: "#0f172a",
    mutedText: "rgba(30, 41, 59, 0.55)",
    placeholder: "rgba(100, 116, 139, 0.4)",
    accent: "#6b7280",
    accentSoft: "rgba(107,114,128,0.12)",
    input: "rgba(248,250,252,0.95)",
    inputHover: "rgba(255,255,255,1)",
    dropdown: "rgba(255,255,255,0.98)",
    chipBg: "rgba(229,231,235,0.5)",
    chipText: "#374151",
    chipBorder: "rgba(209,213,219,0.8)",
    chipHover: "rgba(209,213,219,0.3)",
    ring: "rgba(107,114,128,0.2)",
    shadow: "0 30px 80px rgba(148,163,184,0.2)",
    sectionShadow: "0 16px 40px rgba(148,163,184,0.15)",
    glowOne: "rgba(107,114,128,0.15)",
    glowTwo: "rgba(107,114,128,0.12)",
  },
};

interface CreateUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUserCreated: (newDepartments?: Department[]) => void;
  departments: Department[];
}

// ✅ Core component remains the same, keep everything else as-is from your version
// ⛔ Do NOT add “import React from 'react'” if using Vite with React 17+
// JSX transform automatically handles React scope now.

const CreateUserModal: React.FC<CreateUserModalProps> = ({ isOpen, onClose, onUserCreated, departments }) => {
    const { user: currentUser } = useAuth();

    const initialDepartment = departments.length > 0 ? departments[0].name : 'add_new';

    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [employerId, setEmployerId] = useState('');
    const [role, setRole] = useState<Role>(Role.USER);
    const [department, setDepartment] = useState(initialDepartment);
    const [newDepartmentName, setNewDepartmentName] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [themeMode, setThemeMode] = useState<ThemeMode>('light');

    const { avatars, loading: avatarsLoading } = useAvatarLibrary();
    const [avatarAssetId, setAvatarAssetId] = useState<string | null>(null);
    const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
    const [customAvatarDataUrl, setCustomAvatarDataUrl] = useState<string | null>(null);
    const [avatarFrame, setAvatarFrame] = useState<string>(DEFAULT_FRAME_ID);
    const [avatarUploading, setAvatarUploading] = useState(false);

    const theme = THEME_MODES[themeMode];
    const previewFrameClass = useMemo(() => getFrameClassName(avatarFrame, role), [avatarFrame, role]);

    const handleSelectAvatar = useCallback((asset: AvatarAsset) => {
        setCustomAvatarDataUrl(null);
        setAvatarAssetId(asset.id);
        setAvatarPreview(asset.url ?? asset.externalUrl ?? null);
    }, []);

    const handleCustomAvatarCropped = useCallback(async (dataUrl: string) => {
        setCustomAvatarDataUrl(dataUrl);
        setAvatarAssetId(null);
        setAvatarPreview(dataUrl);
    }, []);

    const handleClearAvatar = useCallback(() => {
        setAvatarAssetId(null);
        setAvatarPreview(null);
        setCustomAvatarDataUrl(null);
    }, []);

    const themeVariables = useMemo<React.CSSProperties>(() => ({
        '--modal-shell-bg': theme.gradient,
        '--modal-surface-bg': theme.surface,
        '--modal-border': theme.sectionBorder,
        '--modal-text': theme.text,
        '--modal-muted': theme.mutedText,
        '--modal-placeholder': theme.placeholder,
        '--modal-accent': theme.accent,
        '--modal-accent-soft': theme.accentSoft,
        '--modal-input-bg': theme.input,
        '--modal-input-hover': theme.inputHover,
        '--modal-dropdown-bg': theme.dropdown,
        '--modal-chip-bg': theme.chipBg,
        '--modal-chip-text': theme.chipText,
        '--modal-chip-border': theme.chipBorder,
        '--modal-chip-hover': theme.chipHover,
        '--modal-ring': theme.ring,
        '--modal-shadow': theme.shadow,
        '--modal-section-shadow': theme.sectionShadow,
        '--modal-glow-one': theme.glowOne,
        '--modal-glow-two': theme.glowTwo,
    } as React.CSSProperties), [theme]);

    const modalStyle = useMemo<React.CSSProperties>(() => ({
        ...themeVariables,
        background: theme.gradient,
        borderColor: theme.sectionBorder,
        boxShadow: theme.shadow,
        color: theme.text,
    }), [themeVariables, theme]);

    const roleOptions = useMemo(() => {
        const options = [
            { id: Role.USER, name: 'User' },
            { id: Role.ADMIN, name: 'Admin' },
            { id: Role.MANAGER, name: 'Manager' },
        ];
        if (currentUser?.role === Role.OWNER) {
            options.push({ id: Role.OWNER, name: 'Owner' });
        }
        return options;
    }, [currentUser]);

    const departmentOptions = useMemo(() => {
        const options = departments.map((dept) => ({ id: dept.name, name: dept.name }));
        options.push({ id: 'add_new', name: '+ Add New Department' });
        return options;
    }, [departments]);

    const fieldClass = 'modal-input w-full text-sm';
    const labelClass = 'modal-label text-xs uppercase tracking-[0.25em]';
    const sectionClass = 'modal-section rounded-3xl border p-5 backdrop-blur-xl';

    const resetForm = () => {
        setName('');
        setEmail('');
        setPassword('');
        setEmployerId('');
        setRole(Role.USER);
        setDepartment(initialDepartment);
        setNewDepartmentName('');
        setError('');
        setIsSubmitting(false);
        setAvatarAssetId(null);
        setAvatarPreview(null);
        setCustomAvatarDataUrl(null);
        setAvatarFrame(DEFAULT_FRAME_ID);
        setAvatarUploading(false);
    };

    const handleClose = () => {
        resetForm();
        onClose();
    };

    const handleUseEmailAsEmployerId = () => {
        if (!email.includes('@')) return;
        const identifier = email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        setEmployerId(identifier);
    };

    const handleGenerateEmployerId = () => {
        const randomId = `EMP-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
        setEmployerId(randomId);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentUser) {
            setError('Authentication error.');
            return;
        }
        setIsSubmitting(true);
        setError('');

        try {
            let finalDepartment = department;
            let newDepartmentsList: Department[] | undefined;

            if (department === 'add_new') {
                if (!newDepartmentName.trim()) {
                    setError('New department name cannot be empty.');
                    setIsSubmitting(false);
                    return;
                }
                const newDept = await api.addDepartment(newDepartmentName.trim());
                finalDepartment = newDept.name;
                newDepartmentsList = [...departments, newDept];
            }

            let createdUser = await api.createUser(
                {
                    name,
                    email,
                    password,
                    employerId: employerId || null,
                    role,
                    department: finalDepartment,
                    avatarAssetId,
                    avatarFrame,
                    is_present: 1,
                },
                currentUser.id,
            );

            let avatarUploadFailed = false;
            if (customAvatarDataUrl) {
                try {
                    setAvatarUploading(true);
                    createdUser = await api.uploadUserAvatar(createdUser.id, customAvatarDataUrl);
                } catch (uploadError: any) {
                    avatarUploadFailed = true;
                    setError(
                        uploadError?.message ??
                            'User created, but we could not save the avatar. You can retry from Edit User.',
                    );
                } finally {
                    setAvatarUploading(false);
                }
            }

            onUserCreated(newDepartmentsList);
            if (avatarUploadFailed) {
                return;
            }
            handleClose();
        } catch (err: any) {
            setError(err.message || 'Failed to create user. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-2 sm:p-4">
            <div
                className="user-modal relative flex h-[75vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl sm:rounded-[28px] border transition duration-300"
                style={modalStyle}
                data-theme={themeMode}
            >
                <div
                    className="pointer-events-none absolute -right-12 top-0 h-44 sm:h-56 w-44 sm:w-56 rounded-full blur-3xl"
                    style={{ background: theme.glowOne }}
                />
                <div
                    className="pointer-events-none absolute -left-16 bottom-[-40px] h-40 sm:h-48 w-40 sm:w-48 rounded-full blur-3xl"
                    style={{ background: theme.glowTwo }}
                />

                <header className="relative border-b px-3 sm:px-6 py-3 sm:py-5" style={{ borderColor: 'var(--modal-border)' }}>
                    <button
                        type="button"
                        onClick={handleClose}
                        className="modal-secondary-button absolute right-3 sm:right-6 top-3 sm:top-5 px-2 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold whitespace-nowrap"
                    >
                        Close
                    </button>
                    <div className="flex flex-col gap-2 sm:gap-4 pr-20 sm:pr-24 md:pr-32 sm:flex-row sm:items-center sm:justify-between">
                        <div className="space-y-1 sm:space-y-2">
                            <p className="text-xs font-semibold uppercase tracking-[0.35em] modal-muted">New teammate</p>
                            <h2 className="text-xl sm:text-2xl font-bold tracking-tight">Create User</h2>
                            <p className="max-w-md text-xs sm:text-sm modal-muted line-clamp-2 sm:line-clamp-none">
                                Configure the essentials before inviting a new squad member aboard.
                            </p>
                        </div>

                    </div>
                </header>

                <div className="relative flex-1 overflow-y-auto custom-scrollbar px-3 sm:px-6 py-4 sm:py-6">
                    <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6 pb-4">
                        <section className={sectionClass}>
                            <p className="section-heading text-sm sm:text-base">Identity</p>
                            <div className="mt-3 sm:mt-4 space-y-3 sm:space-y-4">
                                <div>
                                    <label htmlFor="name" className={labelClass}>Full name</label>
                                    <input
                                        id="name"
                                        type="text"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        required
                                        className={`${fieldClass} mt-1.5 sm:mt-2`}
                                        placeholder="e.g. Alex Mercer"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="email" className={labelClass}>Email address</label>
                                    <input
                                        id="email"
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                        className={`${fieldClass} mt-1.5 sm:mt-2`}
                                        placeholder="alex@example.com"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="password" className={labelClass}>Password</label>
                                    <input
                                        id="password"
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                        className={`${fieldClass} mt-1.5 sm:mt-2`}
                                        placeholder="Enter a secure password"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="employerId" className={labelClass}>Employer ID</label>
                                    <input
                                        id="employerId"
                                        type="text"
                                        value={employerId}
                                        onChange={(e) => setEmployerId(e.target.value)}
                                        className={`${fieldClass} mt-1.5 sm:mt-2`}
                                        placeholder="Optional identifier"
                                    />
                                    <div className="modal-quick-actions mt-2 sm:mt-3 flex gap-2 flex-wrap">
                                        <button type="button" onClick={handleGenerateEmployerId} className="modal-quick-action text-xs sm:text-sm px-2 sm:px-3 py-1">Generate</button>
                                        <button type="button" onClick={handleUseEmailAsEmployerId} className="modal-quick-action text-xs sm:text-sm px-2 sm:px-3 py-1">Use email</button>
                                        {employerId && (
                                            <button type="button" onClick={() => setEmployerId('')} className="modal-quick-action text-xs sm:text-sm px-2 sm:px-3 py-1">Clear</button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </section>

                        <section className={sectionClass}>
                            <p className="section-heading text-sm sm:text-base">Profile appearance</p>
                            <div className="mt-3 sm:mt-4 space-y-4 sm:space-y-6">
                                <AvatarPicker
                                    avatars={avatars}
                                    loading={avatarsLoading}
                                    selectedAvatarId={avatarAssetId}
                                    selectedAvatarUrl={avatarPreview}
                                    customPreviewUrl={customAvatarDataUrl}
                                    onSelectAvatar={handleSelectAvatar}
                                    onRequestClear={handleClearAvatar}
                                    onCustomAvatarCropped={handleCustomAvatarCropped}
                                    uploading={avatarUploading}
                                    previewClassName={previewFrameClass}
                                />

                                <div className="space-y-2 sm:space-y-3">
                                    <p className="text-xs font-semibold uppercase tracking-[0.2em] modal-muted">Avatar frame</p>
                                    <div className="grid gap-2 sm:gap-3 sm:grid-cols-3">
                                        {FRAME_OPTIONS.map((option) => {
                                            const isActive = avatarFrame === option.id;
                                            const frameClass = getFrameClassName(option.id, role);
                                            return (
                                                <button
                                                    key={option.id}
                                                    type="button"
                                                    onClick={() => setAvatarFrame(option.id)}
                                                    className={`group rounded-lg sm:rounded-xl border px-2 sm:px-3 py-2 sm:py-3 text-left transition ${
                                                        isActive
                                                            ? 'border-indigo-500/80 bg-indigo-500/5 shadow-md shadow-indigo-500/20'
                                                            : 'border-slate-200 hover:border-indigo-400 hover:bg-indigo-500/5 dark:border-slate-700'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-2 sm:gap-3">
                                                        <div
                                                            className={`flex h-10 sm:h-12 w-10 sm:w-12 items-center justify-center overflow-hidden rounded-full bg-white shadow-sm dark:bg-slate-900 ${frameClass}`}
                                                        >
                                                            {(avatarPreview || customAvatarDataUrl) ? (
                                                                <img
                                                                    src={avatarPreview || customAvatarDataUrl}
                                                                    alt="Avatar frame preview"
                                                                    className="h-full w-full object-cover"
                                                                />
                                                                ) : (
                                                                <span className="text-[8px] sm:text-[10px] uppercase tracking-[0.25em] text-slate-400 dark:text-slate-500">
                                                                    Frame
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="space-y-0.5 sm:space-y-1 min-w-0">
                                                            <p className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-100 truncate">{option.label}</p>
                                                            <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">{option.description}</p>
                                                        </div>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                        Rings are tinted automatically by role and glow brighter as badge streaks climb.
                                    </p>
                                </div>
                            </div>
                        </section>

                        <section className={sectionClass}>
                            <p className="section-heading text-sm sm:text-base">Access & department</p>
                            <div className="mt-3 sm:mt-4 space-y-3 sm:space-y-4">
                                <div>
                                    <label htmlFor="role" className={labelClass}>Role</label>
                                    <SingleSelect
                                        id="role"
                                        options={roleOptions}
                                        value={role}
                                        onChange={(value) => setRole(value as Role)}
                                        placeholder="Select role..."
                                        className="mt-2"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="department" className={labelClass}>Department</label>
                                    <SingleSelect
                                        id="department"
                                        options={departmentOptions}
                                        value={department}
                                        onChange={setDepartment}
                                        placeholder="Select department..."
                                        className="mt-2"
                                    />
                                    {department === 'add_new' && (
                                        <input
                                            type="text"
                                            value={newDepartmentName}
                                            onChange={(e) => setNewDepartmentName(e.target.value)}
                                            className={`${fieldClass} mt-2 sm:mt-3`}
                                            placeholder="New department name"
                                        />
                                    )}
                                </div>
                            </div>
                        </section>

                        {error && (
                            <p className="text-xs sm:text-sm font-semibold" style={{ color: '#f87171' }}>
                                {error}
                            </p>
                        )}

                        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 sm:gap-3 pt-2">
                            <button
                                type="button"
                                onClick={handleClose}
                                className="modal-secondary-button px-3 sm:px-4 py-2 text-xs sm:text-sm"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="modal-primary-button px-3 sm:px-4 py-2 text-xs sm:text-sm"
                            >
                                {isSubmitting ? 'Creating...' : 'Create user'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default CreateUserModal;







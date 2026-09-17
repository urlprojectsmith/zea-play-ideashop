
import os

path = r'e:\URL-FACTORY-PROJECT\zea-play 17-02-2026 (3)\frontend\services\mockApi.ts'
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
signature_fixed = False
body_fixed = False

for line in lines:
    # Update signature
    if "updateCurrentUserProfile(userId: string, updates: Partial<Pick<User, 'name' | 'department' | 'employerId' | 'avatarAssetId' | 'avatarFrame'>>)" in line and not signature_fixed:
        line = line.replace("'avatarFrame'", "'avatarFrame' | 'is_present'")
        signature_fixed = True
    
    new_lines.append(line)
    
    # Update body building
    if "if (updates.employerId !== undefined) body.employer_id = updates.employerId || null;" in line and not body_fixed:
        if '    if (updates.employerId !== undefined) body.employer_id = updates.employerId || null;' in line:
            new_lines.append('      if (updates.is_present !== undefined) body.is_present = updates.is_present;\n')
            body_fixed = True

with open(path, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print(f"Update status: Signature={signature_fixed}, Body={body_fixed}")

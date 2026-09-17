
import os

path = r'e:\URL-FACTORY-PROJECT\zea-play 17-02-2026 (3)\frontend\services\mockApi.ts'
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
api_user_fixed = False
map_user_fixed = False

for line in lines:
    new_lines.append(line)
    # Fix ApiUser type (around line 354)
    if 'unlocked_achievement_ids: string[];' in line and not api_user_fixed:
        # Check if we are inside ApiUser (this is a bit naive but may work)
        # Actually better to just check the line precisely
        if '  unlocked_achievement_ids: string[];' in line:
            new_lines.append('  is_present: number;\n')
            api_user_fixed = True
    
    # Fix mapUser function (around line 1446)
    if 'claimedRewardIds: user.claimed_reward_ids ?? [],' in line and not map_user_fixed:
        if '    claimedRewardIds: user.claimed_reward_ids ?? [],' in line:
            new_lines.append('    is_present: user.is_present ?? 0,\n')
            map_user_fixed = True

with open(path, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print(f"Update status: ApiUser={api_user_fixed}, mapUser={map_user_fixed}")

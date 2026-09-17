
import os

path = r'e:\URL-FACTORY-PROJECT\zea-play 17-02-2026 (3)\frontend\services\mockApi.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

target = 'if (updates.unlockedAchievementIds !== undefined) body.unlocked_achievement_ids = updates.unlockedAchievementIds;'
replacement = target + '\n      if (updates.is_present !== undefined) body.is_present = updates.is_present;'

if target in content:
    new_content = content.replace(target, replacement)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Successfully updated mockApi.ts")
else:
    print("Target not found")

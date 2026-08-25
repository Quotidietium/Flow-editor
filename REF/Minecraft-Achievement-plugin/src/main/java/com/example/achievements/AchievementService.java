package com.example.achievements;

import org.bukkit.Bukkit;
import org.bukkit.advancement.Advancement;
import org.bukkit.advancement.AdvancementProgress;
import org.bukkit.entity.Player;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

/**
 * 封装对服务端 Advancement 对象的查询与授予。
 * 所有成就的条件均使用 minecraft:impossible 触发器，只能由此处调用
 * {@link AdvancementProgress#awardCriteria(String)} 授予。
 */
public final class AchievementService {

    private final Map<Achievement, Advancement> advancements = new EnumMap<>(Achievement.class);

    private Advancement advancement(Achievement achievement) {
        return advancements.computeIfAbsent(achievement, a -> Bukkit.getAdvancement(a.key()));
    }

    public boolean isDone(Player player, Achievement achievement) {
        Advancement advancement = advancement(achievement);
        return advancement != null && player.getAdvancementProgress(advancement).isDone();
    }

    /** 授予整项成就（补齐所有剩余条件）。 */
    public void award(Player player, Achievement achievement) {
        Advancement advancement = advancement(achievement);
        if (advancement == null) {
            return;
        }
        AdvancementProgress progress = player.getAdvancementProgress(advancement);
        if (progress.isDone()) {
            return;
        }
        for (String criterion : new ArrayList<>(progress.getRemainingCriteria())) {
            progress.awardCriteria(criterion);
        }
    }

    /** 只授予单个条件，用于“大满贯”这类由多项条件汇总而成的成就。 */
    public void awardCriterion(Player player, Achievement achievement, String criterion) {
        Advancement advancement = advancement(achievement);
        if (advancement == null) {
            return;
        }
        AdvancementProgress progress = player.getAdvancementProgress(advancement);
        if (progress.getAwardedCriteria().contains(criterion)) {
            return;
        }
        progress.awardCriteria(criterion);
    }

    /** 服务端实际注册成功的成就数量，用于诊断内置数据包是否加载。 */
    public long registeredCount() {
        return Arrays.stream(Achievement.values()).filter(a -> advancement(a) != null).count();
    }

    public int totalCount() {
        return Achievement.values().length;
    }
}

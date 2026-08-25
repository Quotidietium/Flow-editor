package com.example.achievements;

import net.kyori.adventure.key.Key;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import org.bukkit.Location;
import org.bukkit.Sound;
import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.entity.Enemy;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.block.BlockBreakEvent;
import org.bukkit.event.entity.EntityDeathEvent;
import org.bukkit.event.player.PlayerAdvancementDoneEvent;
import org.bukkit.event.player.PlayerFishEvent;
import org.bukkit.event.player.PlayerItemConsumeEvent;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerMoveEvent;
import org.bukkit.plugin.java.JavaPlugin;

/**
 * 监听游戏事件、累计进度计数，并在达到阈值时通过 AchievementService 授予成就。
 */
public final class AchievementListener implements Listener {

    private final AchievementService service;
    private final ProgressStore store;
    private final int blockTarget;
    private final int foodTarget;
    private final int killTarget;
    private final int fishTarget;
    private final int skyHeight;

    public AchievementListener(JavaPlugin plugin, AchievementService service, ProgressStore store) {
        this.service = service;
        this.store = store;
        FileConfiguration config = plugin.getConfig();
        this.blockTarget = config.getInt("thresholds.blocks-broken", 200);
        this.foodTarget = config.getInt("thresholds.items-eaten", 30);
        this.killTarget = config.getInt("thresholds.monsters-killed", 30);
        this.fishTarget = config.getInt("thresholds.fish-caught", 10);
        this.skyHeight = config.getInt("thresholds.sky-height", 300);
    }

    @EventHandler
    public void onJoin(PlayerJoinEvent event) {
        service.award(event.getPlayer(), Achievement.FIRST_JOIN);
    }

    @EventHandler(ignoreCancelled = true)
    public void onBlockBreak(BlockBreakEvent event) {
        Player player = event.getPlayer();
        if (service.isDone(player, Achievement.BLOCK_BREAKER)) {
            return;
        }
        if (store.addBlockBroken(player) >= blockTarget) {
            service.award(player, Achievement.BLOCK_BREAKER);
        }
    }

    @EventHandler(ignoreCancelled = true)
    public void onConsume(PlayerItemConsumeEvent event) {
        Player player = event.getPlayer();
        if (service.isDone(player, Achievement.FOODIE)) {
            return;
        }
        if (store.addItemEaten(player) >= foodTarget) {
            service.award(player, Achievement.FOODIE);
        }
    }

    @EventHandler
    public void onEntityDeath(EntityDeathEvent event) {
        Player killer = event.getEntity().getKiller();
        if (killer == null || !(event.getEntity() instanceof Enemy)) {
            return;
        }
        if (service.isDone(killer, Achievement.MONSTER_HUNTER)) {
            return;
        }
        if (store.addMonsterKilled(killer) >= killTarget) {
            service.award(killer, Achievement.MONSTER_HUNTER);
        }
    }

    @EventHandler(ignoreCancelled = true)
    public void onFish(PlayerFishEvent event) {
        if (event.getState() != PlayerFishEvent.State.CAUGHT_FISH) {
            return;
        }
        Player player = event.getPlayer();
        if (service.isDone(player, Achievement.ANGLERS_PRIDE)) {
            return;
        }
        if (store.addFishCaught(player) >= fishTarget) {
            service.award(player, Achievement.ANGLERS_PRIDE);
        }
    }

    @EventHandler(ignoreCancelled = true)
    public void onMove(PlayerMoveEvent event) {
        Location to = event.getTo();
        if (to == null || to.getY() < skyHeight) {
            return;
        }
        service.award(event.getPlayer(), Achievement.SKY_WALKER);
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onAdvancementDone(PlayerAdvancementDoneEvent event) {
        Key key = event.getAdvancement().getKey();
        if (!key.namespace().equals(Achievement.NAMESPACE)) {
            return;
        }
        Player player = event.getPlayer();
        if (player == null) {
            return;
        }
        // 根进度用于显示标签页、大满贯自身不参与汇总，其余每完成一项就为大满贯补一个条件
        Achievement achievement = Achievement.byId(key.value());
        if (achievement != null && achievement != Achievement.ROOT && achievement != Achievement.COMPLETIONIST) {
            service.awardCriterion(player, Achievement.COMPLETIONIST, key.value());
        }

        // 覆盖默认的英文播报消息；对应的 advancement JSON 中 announce_to_chat 已设为 false，
        // 是否显示由本插件统一控制（原版 /gamerule showAdvancementMessages 仍可全局关闭）
        String displayName = achievement != null ? achievement.displayName() : key.value();
        event.message(Component.text("[成就] ", NamedTextColor.GOLD)
                .append(Component.text(player.getName(), NamedTextColor.YELLOW))
                .append(Component.text(" 达成了 "))
                .append(Component.text("[" + displayName + "]", NamedTextColor.AQUA)));
        player.playSound(player.getLocation(), Sound.ENTITY_PLAYER_LEVELUP, 1.0f, 1.0f);
    }
}

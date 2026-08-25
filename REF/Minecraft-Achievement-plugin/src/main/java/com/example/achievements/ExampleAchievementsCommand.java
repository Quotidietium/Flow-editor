package com.example.achievements;

import io.papermc.paper.command.brigadier.BasicCommand;
import io.papermc.paper.command.brigadier.CommandSourceStack;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.format.TextDecoration;
import org.bukkit.command.CommandSender;
import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.entity.Player;
import org.bukkit.plugin.java.JavaPlugin;
import org.jetbrains.annotations.NotNull;

/**
 * /exampleach（别名 /each）：查看当前玩家的成就达成进度与各项计数。
 * Paper 插件的命令不再经由 plugin.yml 声明，而是由主类在
 * LifecycleEvents.COMMANDS 生命周期事件中注册本实现。
 */
public final class ExampleAchievementsCommand implements BasicCommand {

    private final AchievementService service;
    private final ProgressStore store;
    private final int blockTarget;
    private final int foodTarget;
    private final int killTarget;
    private final int fishTarget;

    public ExampleAchievementsCommand(JavaPlugin plugin, AchievementService service, ProgressStore store) {
        this.service = service;
        this.store = store;
        FileConfiguration config = plugin.getConfig();
        this.blockTarget = config.getInt("thresholds.blocks-broken", 200);
        this.foodTarget = config.getInt("thresholds.items-eaten", 30);
        this.killTarget = config.getInt("thresholds.monsters-killed", 30);
        this.fishTarget = config.getInt("thresholds.fish-caught", 10);
    }

    @Override
    public void execute(@NotNull CommandSourceStack stack, @NotNull String[] args) {
        CommandSender sender = stack.getSender();
        if (!(sender instanceof Player player)) {
            sender.sendMessage(Component.text("该命令仅玩家可用。", NamedTextColor.RED));
            return;
        }

        ProgressStore.PlayerProgress progress = store.get(player.getUniqueId());
        player.sendMessage(Component.text("—— 示例成就进度 ——", NamedTextColor.GOLD, TextDecoration.BOLD));

        sendLine(player, Achievement.FIRST_JOIN, null);
        sendLine(player, Achievement.BLOCK_BREAKER, progress.blocksBroken() + "/" + blockTarget);
        sendLine(player, Achievement.FOODIE, progress.itemsEaten() + "/" + foodTarget);
        sendLine(player, Achievement.MONSTER_HUNTER, progress.monstersKilled() + "/" + killTarget);
        sendLine(player, Achievement.ANGLERS_PRIDE, progress.fishCaught() + "/" + fishTarget);
        sendLine(player, Achievement.SKY_WALKER, null);
        sendLine(player, Achievement.COMPLETIONIST, null);
    }

    private void sendLine(Player player, Achievement achievement, String counter) {
        boolean done = service.isDone(player, achievement);
        Component line = Component.text(done ? " ✔ " : " □ ", done ? NamedTextColor.GREEN : NamedTextColor.GRAY)
                .append(Component.text(achievement.displayName(), done ? NamedTextColor.AQUA : NamedTextColor.WHITE));
        if (counter != null && !done) {
            line = line.append(Component.text("  (" + counter + ")", NamedTextColor.GRAY));
        }
        player.sendMessage(line);
    }
}

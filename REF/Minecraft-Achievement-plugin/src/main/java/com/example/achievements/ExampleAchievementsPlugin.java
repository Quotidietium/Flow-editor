package com.example.achievements;

import io.papermc.paper.plugin.lifecycle.event.types.LifecycleEvents;
import org.bukkit.plugin.java.JavaPlugin;

import java.util.List;

/**
 * 示例成就插件主类。
 * 成就的 JSON 定义位于 resources/datapack/，由 {@link ExampleAchievementsBootstrap}
 * 在启动早期注册为内置数据包，从而在原版进度界面中显示为独立标签页。
 */
public final class ExampleAchievementsPlugin extends JavaPlugin {

    private ProgressStore progressStore;
    private AchievementService achievementService;

    @Override
    public void onEnable() {
        saveDefaultConfig();
        this.progressStore = ProgressStore.load(this);
        this.achievementService = new AchievementService();

        getServer().getPluginManager().registerEvents(
                new AchievementListener(this, achievementService, progressStore), this);

        // Paper 插件命令：在 COMMANDS 生命周期事件中注册（支持 /reload 重新注册）
        getLifecycleManager().registerEventHandler(LifecycleEvents.COMMANDS, event -> event.registrar().register(
                "exampleach",
                "查看示例成就的达成进度。",
                List.of("each"),
                new ExampleAchievementsCommand(this, achievementService, progressStore)));

        long intervalSeconds = getConfig().getLong("autosave-interval-seconds", 300);
        getServer().getScheduler().runTaskTimer(this, progressStore::saveIfDirty,
                intervalSeconds * 20L, intervalSeconds * 20L);

        long registered = achievementService.registeredCount();
        if (registered == achievementService.totalCount()) {
            getLogger().info("内置数据包加载成功，" + registered + " 个自定义成就已就绪。");
        } else {
            getLogger().warning("仅注册了 " + registered + "/" + achievementService.totalCount()
                    + " 个成就，内置数据包可能未正确加载！请检查控制台中的数据包错误。");
        }
    }

    @Override
    public void onDisable() {
        if (progressStore != null) {
            progressStore.save();
        }
    }
}

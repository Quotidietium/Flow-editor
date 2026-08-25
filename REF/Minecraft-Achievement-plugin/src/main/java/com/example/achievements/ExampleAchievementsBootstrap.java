package com.example.achievements;

import io.papermc.paper.datapack.DatapackRegistrar;
import io.papermc.paper.datapack.DiscoveredDatapack;
import io.papermc.paper.plugin.bootstrap.BootstrapContext;
import io.papermc.paper.plugin.bootstrap.PluginBootstrap;
import io.papermc.paper.plugin.lifecycle.event.types.LifecycleEvents;

import java.io.IOException;
import java.net.URISyntaxException;

/**
 * 插件引导类：在服务器加载数据包之前，把 jar 内 resources/datapack 目录
 * 注册为名为 ExampleAchievements/provided 的内置数据包。
 * DATAPACK_DISCOVERY 只能由 BootstrapContext 注册，且数据包发现早于
 * 插件的 onLoad/onEnable，因此必须放在 bootstrapper 里完成。
 */
public final class ExampleAchievementsBootstrap implements PluginBootstrap {

    @Override
    public void bootstrap(BootstrapContext context) {
        context.getLogger().info("bootstrap 阶段：注册数据包发现处理器");
        context.getLifecycleManager().registerEventHandler(LifecycleEvents.DATAPACK_DISCOVERY, event -> {
            try {
                DatapackRegistrar registrar = event.registrar();
                DiscoveredDatapack pack = registrar.discoverPack(
                        getClass().getResource("/datapack").toURI(), "provided");
                context.getLogger().info("数据包发现完成: "
                        + (pack != null ? pack.getName() : "null"));
            } catch (URISyntaxException | IOException e) {
                throw new IllegalStateException("注册内置数据包失败", e);
            }
        });
    }
}

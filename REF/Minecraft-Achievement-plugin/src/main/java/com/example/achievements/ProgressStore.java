package com.example.achievements;

import org.bukkit.configuration.file.YamlConfiguration;
import org.bukkit.entity.Player;
import org.bukkit.plugin.java.JavaPlugin;

import java.io.File;
import java.io.IOException;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.logging.Level;

/**
 * 以 YAML 持久化每个玩家的累计计数（挖掘/进食/击杀/钓鱼）。
 * 计数先在内存中累加并标记脏位，由定时任务与 onDisable 统一落盘。
 */
public final class ProgressStore {

    /** 单个玩家的四项累计计数。 */
    public static final class PlayerProgress {
        int blocksBroken;
        int itemsEaten;
        int monstersKilled;
        int fishCaught;

        public int blocksBroken() {
            return blocksBroken;
        }

        public int itemsEaten() {
            return itemsEaten;
        }

        public int monstersKilled() {
            return monstersKilled;
        }

        public int fishCaught() {
            return fishCaught;
        }
    }

    private final JavaPlugin plugin;
    private final File file;
    private final Map<UUID, PlayerProgress> progress = new ConcurrentHashMap<>();
    private volatile boolean dirty;

    private ProgressStore(JavaPlugin plugin, File file) {
        this.plugin = plugin;
        this.file = file;
    }

    public static ProgressStore load(JavaPlugin plugin) {
        File file = new File(plugin.getDataFolder(), "progress.yml");
        ProgressStore store = new ProgressStore(plugin, file);
        if (!file.exists()) {
            return store;
        }
        YamlConfiguration yaml = YamlConfiguration.loadConfiguration(file);
        for (String key : yaml.getKeys(false)) {
            UUID uuid;
            try {
                uuid = UUID.fromString(key);
            } catch (IllegalArgumentException e) {
                plugin.getLogger().warning("progress.yml 中存在无法解析的键: " + key);
                continue;
            }
            PlayerProgress p = new PlayerProgress();
            p.blocksBroken = yaml.getInt(key + ".blocks-broken");
            p.itemsEaten = yaml.getInt(key + ".items-eaten");
            p.monstersKilled = yaml.getInt(key + ".monsters-killed");
            p.fishCaught = yaml.getInt(key + ".fish-caught");
            store.progress.put(uuid, p);
        }
        return store;
    }

    public PlayerProgress get(UUID uuid) {
        return progress.computeIfAbsent(uuid, u -> new PlayerProgress());
    }

    public int addBlockBroken(Player player) {
        PlayerProgress p = get(player.getUniqueId());
        dirty = true;
        return ++p.blocksBroken;
    }

    public int addItemEaten(Player player) {
        PlayerProgress p = get(player.getUniqueId());
        dirty = true;
        return ++p.itemsEaten;
    }

    public int addMonsterKilled(Player player) {
        PlayerProgress p = get(player.getUniqueId());
        dirty = true;
        return ++p.monstersKilled;
    }

    public int addFishCaught(Player player) {
        PlayerProgress p = get(player.getUniqueId());
        dirty = true;
        return ++p.fishCaught;
    }

    public void saveIfDirty() {
        if (dirty) {
            save();
        }
    }

    public synchronized void save() {
        YamlConfiguration yaml = new YamlConfiguration();
        progress.forEach((uuid, p) -> {
            String base = uuid.toString();
            yaml.set(base + ".blocks-broken", p.blocksBroken);
            yaml.set(base + ".items-eaten", p.itemsEaten);
            yaml.set(base + ".monsters-killed", p.monstersKilled);
            yaml.set(base + ".fish-caught", p.fishCaught);
        });
        try {
            yaml.save(file);
            dirty = false;
        } catch (IOException e) {
            plugin.getLogger().log(Level.WARNING, "保存 progress.yml 失败", e);
        }
    }
}

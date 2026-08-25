package com.example.achievements;

import org.bukkit.NamespacedKey;

/**
 * 插件提供的全部成就定义，与 resources/datapack/data/exampleach/advancement/ 下的 JSON 一一对应。
 */
public enum Achievement {

    ROOT("root", "示例成就", false),
    FIRST_JOIN("first_join", "你好，世界！", true),
    BLOCK_BREAKER("block_breaker", "愚公移山", true),
    FOODIE("foodie", "干饭人", true),
    MONSTER_HUNTER("monster_hunter", "为民除害", true),
    ANGLERS_PRIDE("anglers_pride", "姜太公再世", true),
    SKY_WALKER("sky_walker", "平流层观光客", true),
    COMPLETIONIST("completionist", "大满贯！", true);

    /** 数据包使用的命名空间，必须与 advancement JSON 的目录一致。 */
    public static final String NAMESPACE = "exampleach";

    private final String id;
    private final String displayName;
    /** 是否计入 /exampleach 统计列表（根进度不计入）。 */
    private final boolean listed;

    Achievement(String id, String displayName, boolean listed) {
        this.id = id;
        this.displayName = displayName;
        this.listed = listed;
    }

    public String id() {
        return id;
    }

    public String displayName() {
        return displayName;
    }

    public boolean listed() {
        return listed;
    }

    public NamespacedKey key() {
        return new NamespacedKey(NAMESPACE, id);
    }

    /** 按进度 id 查找对应枚举，找不到（不属于本插件）返回 null。 */
    public static Achievement byId(String id) {
        for (Achievement achievement : values()) {
            if (achievement.id.equals(id)) {
                return achievement;
            }
        }
        return null;
    }
}

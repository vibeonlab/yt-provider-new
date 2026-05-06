-- 扩展 commands.type 允许广播控制类指令（清理磁盘缓存、内存模式）。
-- 错误示例：violates check constraint "commands_type_check"
-- 在 Supabase：SQL Editor → 粘贴执行（建议先在测试库验证）。

-- 1) 删除旧 CHECK（名称若不同，请在 Table Editor → commands → Constraints 中核对）
ALTER TABLE public.commands DROP CONSTRAINT IF EXISTS commands_type_check;

-- 2) 重新添加 CHECK，包含原有类型 + 新增类型
ALTER TABLE public.commands
  ADD CONSTRAINT commands_type_check
  CHECK (
    type = ANY (
      ARRAY[
        'open_stream'::text,
        'go_home'::text,
        'clear_disk_cache'::text,
        'set_power_mode'::text
      ]
    )
  );

-- 若你的项目曾用 ENUM 类型而非 TEXT+CHECK，请改为 ALTER TYPE ... ADD VALUE（略）。

'use client';

import { useEffect, useRef } from 'react';
import { useLocale } from '@/lib/i18n/context';

const ANIMATION_MS = 1600;

/**
 * 提交成功后的纯视觉确认（用户反馈：把原来带"撤销"按钮的 toast 改成
 * 一个飞向近期账单区域的短暂动画，不再可交互——撤销入口没了，这不是
 * 疏漏，是这次改动本身要去掉的东西）。
 *
 * 不走全局共享的 Toast 系统（原 Toaster.tsx，已删除）：那套是"任意页面
 * 任意位置"的固定角落堆叠，这里的飞行起点/终点是 ledger 页自己的布局
 * 细节（贴着 Composer 卡片上边缘起飞），不适合塞进通用组件。
 *
 * fixed 定位、原地淡入 → 短暂停留 → 向上飘移淡出（见 globals.css 的
 * record-fly-up keyframes），不追求精确落在"近期账单"卡片上——纯粹给
 * "刚记的这笔账飞向上方"的观感。移动端/桌面端的起点分别对应
 * ledger/page.tsx 里输入区容器的高度（42dvh / h-96）。
 */
export function AddedFlash({
  count,
  unsyncedCount = 0,
  onDone,
}: {
  count: number;
  unsyncedCount?: number;
  onDone: () => void;
}) {
  const { t } = useLocale();
  // onDone 每次渲染可能是新的函数引用（父组件内联传入）——只在挂载时
  // 排一次定时器，不希望引用变化重新触发效果、打乱动画计时。
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const timer = setTimeout(() => onDoneRef.current(), ANIMATION_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(42dvh+1rem)] z-50 flex justify-center px-4 lg:bottom-[calc(24rem+2rem)]"
    >
      <div className="rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-ink shadow-pop [animation:record-fly-up_1.6s_ease-out_forwards]">
        {t('undoneCount', { count, unsynced: unsyncedCount })}
      </div>
    </div>
  );
}

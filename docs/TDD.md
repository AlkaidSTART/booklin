# 技术选型文档：3D 沉浸式图书数字展厅（Scrollytelling 单页）

## 1. 项目背景与设计目标

### 1.1 项目概述

本项目旨在为实体/数字融合图书打造类似 oryzo.ai 水准的单品概念推广页面。页面通过全屏 3D 画布与滚轮时间轴绑定（Scrollytelling），以工业硬件发布会级别的质感与叙事，呈现图书的物理装帧、解构细节、交互手感以及云端数字生态（书链 Bookln 核心能力）。

### 1.2 核心体验指标

- **交互体验**：滚轮平滑阻尼，实现 0 卡顿的相机推拉、模型翻转形变、纸张动态弯折。
- **视觉还原**：物理写实级 PBR 材质（微距纸张纤维、书脊烫金反射、柔和桌面接触阴影、电影级景深散焦）。
- **性能底线**：首屏有效加载时间 < 2.5s，主流移动端与桌面设备稳定 60 FPS，内存占用控制在安全阈值（防止 iOS WebGL 上下文崩溃）。

## 2. 系统分层架构

页面采用多层解耦架构，将逻辑层、渲染层与交互总线严格分离：

```text
┌─────────────────────────────────────────────────────────────┐
│                 Top Layer: 2D UI & 文字编排                  │
│  (Tailwind CSS + Sticky 章节占位 + Framer Motion 文本淡入淡出)│
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                Event Bus: 交互与滚动编排调度                 │
│       (Lenis 惯性平滑滚动 + GSAP ScrollTrigger 进度归一化)   │
└──────────────────────────────┬──────────────────────────────┘
                               │ Progress: 0.0 ~ 1.0
┌──────────────────────────────▼──────────────────────────────┐
│                   3D WebGL 渲染引擎                         │
│  - React Three Fiber (R3F)                                   │
│  - Drei 场景/相机控制辅助                                    │
│  - Postprocessing 景深/光效                                  │
│  - GLTF (Draco + KTX2) 资产                                  │
└─────────────────────────────────────────────────────────────┘
```

## 3. 核心技术栈选型与对比评估

### 3.1 3D 渲染内核

| 方案 | 优势 | 劣势 | 选型结论 |
| --- | --- | --- | --- |
| Vanilla Three.js | 自由度最高，底座干净，无额外框架开销 | 代码命令式偏沉重，多状态管理与后期管线组织成本高 | 备选（适合自研渲染器团队） |
| Spline（低代码） | 上手快，3D 设计与网页动效可在编辑器内一键出产 | 复杂形变动画（形态键/复杂着色器）受限，后期调色与性能深度优化空间小 | 淘汰（仅适合做简单原型） |
| React Three Fiber (R3F) | 组件化解耦良好；生态极其完善（Drei 现成软阴影、环境贴图、模型加载器开箱即用）；与现代 UI 框架无缝协同 | 存在少量 React 虚拟 DOM 封装认知成本 | **首选推荐** |

**决策理由**：选用 React Three Fiber + `@react-three/drei` + `@react-three/postprocessing`。借助生态中的 `<ContactShadows>` 可轻松实现落地软阴影，`<Environment>` 提供快速 HDR 影棚打光，大幅降低从零编写 Shader 的工期。

### 3.2 滚动平滑与动效编排

| 方案 | 优势 | 劣势 | 选型结论 |
| --- | --- | --- | --- |
| Native Scroll（原生滚动） | 零引入依赖，性能最强 | 各操作系统/鼠标滚轮阻尼不一致，Mac 触控板与 Windows 滚轮手感割裂，无法实现胶片感 | 淘汰 |
| Locomotive Scroll | 早期经典平滑滚动库 | 框架较重，虚拟滚动模式（Virtual Scroll）对无障碍（a11y）和移动端兼容问题较多 | 淘汰 |
| Lenis + GSAP ScrollTrigger | 行业标准方案；Lenis 保持原生滚动拓扑（基于原生滚动监听），轻量丝滑；GSAP 拥有最完备的缓动函数、洗牌驱动与边缘触发 | GSAP 商业高级插件商用需要遵循授权（ScrollTrigger 基础功能免费） | **首选推荐** |

**决策理由**：使用 Lenis 抹平各终端滚动手感差异；使用 GSAP ScrollTrigger 将整个页面高度映射为 0.0 ~ 1.0 的标准标量，精准驱动 3D 相机路径插值（Lerp）与动画播放。

### 3.3 基础框架与工程化

- **构建工具与核心框架**：Vite + React (TypeScript)（或 Next.js App Router 做静态导出 SSG）。
- **UI 样式方案**：Tailwind CSS（保证高精度网格排版，利用 `backdrop-blur` 实现微光磨砂玻璃卡片）。
- **文字排版增强**：Troika-three-text（如果 3D 场景内部需悬浮文字，使用 MSDF 多通道距离场算法，保证极端视角下拉近不模糊）。

## 4. 资产管线与生产标准（Asset Pipeline）

制作质感媲美 Oryzo 的核心在于 3D 资产的控制，不能直接导入生硬的原始模型。

### 4.1 3D 模型资产（Blender）

- **网格体结构（Topology）**
  - 采用「精装书壳 + 5~7 层复合页面网格 + 书签丝带」。
  - 严格控制总面数在 50,000 面（50k Triangles）以内。
- **翻书动画解法（Shape Keys / Morph Targets）**
  - 禁止在前端运行昂贵的布料物理模拟；
  - 在 Blender 内通过形态键制作 3 组基底姿态：`Key_Closed`（合拢）、`Key_HalfOpen`（翻开 45 度）、`Key_Flat`（180 度纯平摊开）；
  - 前端直接通过 GSAP 对 Morph Target 权重数值进行插值过渡。
- **材质与贴图规范**
  - 导出 PBR 标准贴图：BaseColor、Normal（法线，刻画微观纤维）、Roughness（粗糙度）、Metalness（金属度，用于书脊烫金）。
  - 分辨率规格：桌面端 2048x2048，移动端回退至 1024x1024。
  - 环境遮挡（Ambient Occlusion）必须烘焙（Bake）到贴图中，节省实时光照算力。

### 4.2 资产压缩流水线（落地关键）

- **几何体压缩**：使用 Draco 几何体压缩，将 `.glb` 原始文件体积削减 70%~85%。
- **纹理格式压缩**：全面采用 KTX2 / Basis Universal 格式。纹理保持压缩状态直接载入显存，避免移动端设备解码大型 PNG 造成的内存激增与闪退。

## 5. 关键落地技术规范与实现示例

### 5.1 场景核心代码拓扑（React Three Fiber + GSAP）

```tsx
import React, { useRef, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { useGLTF, ContactShadows, Environment } from '@react-three/drei';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import * as THREE from 'three';

gsap.registerPlugin(ScrollTrigger);

function BookModel() {
  // 加载经过 Draco 压缩的模型
  const { scene } = useGLTF('/models/book-transformed.glb');
  const bookRef = useRef<THREE.Group>(null);

  useEffect(() => {
    // 绑定 GSAP ScrollTrigger
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: '#scroll-container',
        start: 'top top',
        end: 'bottom bottom',
        scrub: 1.2, // 惯性阻尼
      },
    });

    // 编排相机推拉、模型翻转与形态键
    if (bookRef.current) {
      tl.to(bookRef.current.position, { y: 0, z: 0.5, ease: 'power2.out' }, 0)
        .to(bookRef.current.rotation, { x: 0, y: Math.PI * 2, ease: 'none' }, 0);
    }

    return () => {
      ScrollTrigger.getAll().forEach((t) => t.kill());
    };
  }, []);

  return (
    <group ref={bookRef} position={[0, 2, 0]} rotation={[0.4, 0.2, 0]}>
      <primitive object={scene} />
      {/* 极简软阴影：离地越高越虚，落地越实 */}
      <ContactShadows
        position={[0, -0.01, 0]}
        opacity={0.7}
        scale={10}
        blur={1.5}
        far={2.5}
      />
    </group>
  );
}

export default function BookScene() {
  return (
    <div className="fixed inset-0 w-screen h-screen pointer-events-none">
      <Canvas
        camera={{ position: [0, 1.5, 4], fov: 45 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
      >
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 8, 5]} intensity={1.2} castShadow />
        <Environment preset="city" />
        <BookModel />
      </Canvas>
    </div>
  );
}
```

## 6. 性能预算与优化红线（Performance Budget）

为保证项目达到 Awwwards 级流畅度与商业上线标准，设定以下硬性预算指标：

| 评估指标 | 目标上限 / 阈值 | 优化控制手段 |
| --- | --- | --- |
| 首屏传输体积 | < 4.5 MB（含贴图/模型） | Draco 几何压缩 + WebP/KTX2 贴图 + Gzip 代码压缩 |
| 绘制调用（Draw Calls） | < 40 个/帧 | 合并模型同材质网格（Mesh Batching），共享 PBR 材质槽 |
| 着色多边形面数 | < 50,000 面 | 减少不必要的细分建模，高精细节由法线贴图表达 |
| 移动端内存占用 | < 250 MB | 销毁不可见组件上下文，严格限制贴图最大边长 ≤ 2048px |
| 首屏渲染遮罩 | 100% 资产就绪后淡入 | 使用 `THREE.LoadingManager`，避免材质未加载完毕穿帮 |

## 7. 风险评估与应对策略

| 风险 | 预案 |
| --- | --- |
| **低端机型 / iOS Safari WebGL 上下文崩溃** | 利用 `@react-three/drei` 的 `AdaptiveDpr` 根据实时渲染帧率自适应降低分辨率比例；对于无 WebGL 兼容设备，自动降级为视差 2D 序列帧/静态海报。 |
| **滚轮驱动与触摸屏滑动手势割裂** | 统一接入 Lenis。Lenis 将触屏滑动手势统一换算为滚动虚拟标量，保证在手机和平板上滑动的速度曲线与桌面端保持一致的物理惯性。 |

## 8. 选型总结矩阵

| 模块 | 选定方案 | 核心价值 |
| --- | --- | --- |
| 开发工程体系 | Vite + React (TypeScript) | 秒级热更新，类型安全，现代工程化标配 |
| 3D 渲染底座 | React Three Fiber (R3F) + Drei | 兼顾 Three.js 灵活性与组件化生态红利 |
| 平滑滚动引擎 | Lenis | 保证各终端手感一致、原生体验的高性能阻尼滚动 |
| 动效调度中心 | GSAP + ScrollTrigger | 毫秒级时间轴控制、数值擦洗与关键帧卡点 |
| 3D 资产格式 | GLB (Draco + KTX2 PBR) | 体积极致压缩，显存直接装载，防止移动端闪退 |
| UI 呈现架构 | Tailwind CSS + Sticky Canvas | 3D 背景置底，上层 2D 文本高精度视差分层 |

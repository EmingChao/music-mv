# 角色接口（CHARACTER-API）

角色是**唯一一处**画人形的地方。所有镜头都调 `ENGINE.char(g, o)` → 转发给 `CHARACTER.draw(g, o)`。
角色只在 `character.js` 里定义一次，镜头脚本不许自己画主角。这就是"角色不漂移"的全部秘密。

## 1. 必须导出

```js
window.CHARACTER = {
  name: '阿蟹',                                   // 一句话能认出是谁
  desc: '一只壳是番茄红的小螃蟹，两根竖着的眼柄，两只大钳',   // 写进设定图的副标题
  EXPRESSIONS: ['neutral','happy','sad','surprised','sleepy'],   // 至少 4 个
  ACTIONS: ['stand','walk','wave','look-up','shiver'],           // 至少 4 个
  setup(CFG, API) {},           // 可选，可 async
  draw(g, o) {},                // 见第 2 节
  handAt(o, which) {},          // 可选：算道具该挂在哪，which = 'left' | 'right'
};
```

## 2. `draw(g, o)` 的参数

```js
o = {
  x, y,            // 脚底中心点的世界坐标（不是身体中心！y 就是踩地的那条线）
  size,            // 身高（像素）。中景用 API.MH（≈画面高 24%），特写 0.4H，远景 0.12H
  facing,          // 'left' | 'right' | 'front'
  expression,      // EXPRESSIONS 里的一个
  action,          // ACTIONS 里的一个
  u,               // 这个动作的进度 0→1（一直是循环的，不是一次性的）
  t,               // 全片秒
  hold,            // 可选：定格用（设定图里传 0.5），正常镜头不传
}
```

规矩：

1. **纯函数**：同样的 `o` 必须画出同一张图。不许读外部状态、不许 `Math.random()`、不许累计变量。
   随机要用固定种子（拿 `o.x + o.size` 之类做种子，或者引擎的 `ENGINE.noise(key, i)`）。
2. **一直在动**：站着也要有呼吸（身体 ±1%、眼柄摆 2°、钳子晃）。`u` 是循环进度，
   `Math.sin(u * Math.PI * 2)` 是呼吸，`Math.sin(u * Math.PI * 4)` 是两步。走路时用 `u` 走 2 步。
3. **朝向**：`facing === 'left'` 时整个身体水平镜像，但**不要**镜像眼睛的高光位置导致变味；镜像用 `g.scale(-1,1)` 包一层。
4. **表情只改脸**：身体姿势不能因为换表情而变。至少要能看出：眼睛形状、眉毛/眼柄角度、嘴。
5. **脚踩在 y 上**：`size` 是身高，所以身体从 `y - size` 画到 `y`。影子画在 `y` 上，扁椭圆，透明度 ≤ 0.25。
6. **不许挡脸**：钳子/道具不要画到眼睛前面（`look-up` 时钳子往下放）。
7. 三种风格画同一个角色，必须一眼认得出是同一只（壳的形状、眼柄数量、钳子大小比例要一致）。

## 3. 设定图

`ENGINE.sheet(g, CFG, API)` 负责排版（见 ENGINE-API.md 第 4 节），但它画角色时**必须**调
`CHARACTER.draw` 而不是自己另画一套。设定图是镜头脚本的"资产参考"，镜头里角色长什么样，
先看设定图。

## 4. 尺寸约定（别自己发明）

| 用法 | size |
|---|---|
| 远景（人在街上很小） | `API.H * 0.12` |
| 中景（MV 主用） | `API.MH` = `API.H * 0.24` |
| 近景/特写 | `API.H * 0.45` |
| 设定图 | 第一排 `API.H * 0.30`，其余 `API.H * 0.16` |

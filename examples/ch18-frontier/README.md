# 第 18 章配套代码：遗忘算法 Demo

基于 Ebbinghaus 遗忘曲线的 Observation 保留分数计算器。

## 运行

```bash
npm install
npm run demo
```

## 输出示例

```
🟢 #6 [decision] 用 BullMQ 替代 setTimeout 做队列
   Score: 28.43 | Age: 7d ago | Access: 3x | Strategy: 始终展示在索引中

🟢 #1 [decision] 选用 PostgreSQL 做主存储
   Score: 22.15 | Age: 30d ago | Access: 5x | Strategy: 始终展示在索引中

🟡 #3 [gotcha] jwt.sign 必须异步调用
   Score: 4.82 | Age: 180d ago | Access: 8x | Strategy: 仅在搜索时出现

🟠 #2 [problem-solution] 修复连接池泄漏
   Score: 1.23 | Age: 90d ago | Access: 2x | Strategy: 归档

🔴 #4 [how-it-works] 读取 package.json 查看依赖
   Score: 0.33 | Age: 200d ago | Access: 0x | Strategy: 可安全删除
```

## 算法要点

- 类型权重：decision=10 > gotcha=8 > problem-solution=5 > how-it-works=2
- 时间衰减：180 天半衰期（指数衰减）
- 访问加成：对数增长（防止刷分）
- 近期加成：30 天内被 fetch 过有额外加分

更多讨论见 [inferloop.dev](https://inferloop.dev)

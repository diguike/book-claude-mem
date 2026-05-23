# 第 1 章配套代码：Memory 策略效率对比

演示三种 Agent Memory 检索策略的 Token 效率差异。

## 运行

```bash
npm install
npm run demo
```

## 输出示例

对比 50 条历史 Observation 下，三种策略的 Token 消耗和信噪比：
- 全量注入：Token 浪费最多，SNR 最低
- 传统 RAG：中等效率，受 Embedding 准确率限制
- Progressive Disclosure：Token 最省，SNR 接近 100%

## 文件说明

- `src/index.ts` — 三种策略对比的主程序

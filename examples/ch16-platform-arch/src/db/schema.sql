-- Memory Platform 数据库 Schema
-- PostgreSQL 15+ with pgvector 扩展

-- 启用 pgvector 扩展
CREATE EXTENSION IF NOT EXISTS vector;

-- 启用 uuid 生成
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 组织表
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  plan VARCHAR(50) NOT NULL DEFAULT 'free', -- free, pro, enterprise
  max_observations INTEGER NOT NULL DEFAULT 10000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 用户表
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL UNIQUE,
  role VARCHAR(50) NOT NULL DEFAULT 'member', -- admin, member, viewer
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Observation 表（核心数据表）
CREATE TABLE observations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  subject_id VARCHAR(255) NOT NULL, -- 被观察对象（如终端用户 ID）
  content TEXT NOT NULL,
  category VARCHAR(100) NOT NULL DEFAULT 'general',
  embedding vector(1536), -- OpenAI text-embedding-3-small 维度
  confidence FLOAT DEFAULT 1.0,
  source VARCHAR(100), -- 来源标识（如 conversation_id）
  metadata JSONB DEFAULT '{}',
  expires_at TIMESTAMPTZ, -- 可选过期时间
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_observations_org_id ON observations(org_id);
CREATE INDEX idx_observations_subject_id ON observations(org_id, subject_id);
CREATE INDEX idx_observations_category ON observations(org_id, category);
CREATE INDEX idx_observations_created_at ON observations(org_id, created_at DESC);

-- 向量相似度索引（IVFFlat，适合中等数据量）
CREATE INDEX idx_observations_embedding ON observations
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- 审计日志表
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  action VARCHAR(50) NOT NULL, -- create, read, update, delete, search
  resource_type VARCHAR(50) NOT NULL, -- observation, user, org
  resource_id UUID,
  details JSONB DEFAULT '{}',
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_org ON audit_logs(org_id, created_at DESC);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id, created_at DESC);

-- Row Level Security (多租户隔离)
ALTER TABLE observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS 策略：用户只能访问自己组织的数据
CREATE POLICY org_isolation_observations ON observations
  USING (org_id = current_setting('app.current_org_id')::UUID);

CREATE POLICY org_isolation_users ON users
  USING (org_id = current_setting('app.current_org_id')::UUID);

CREATE POLICY org_isolation_audit ON audit_logs
  USING (org_id = current_setting('app.current_org_id')::UUID);

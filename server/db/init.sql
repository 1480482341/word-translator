-- ============================================================
-- Word Translator - 数据库初始化脚本
-- 使用方法: mysql -u root -p < db/init.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS word_translator
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE word_translator;

CREATE TABLE IF NOT EXISTS words (
  id         INT           AUTO_INCREMENT PRIMARY KEY,
  word       VARCHAR(255)  NOT NULL UNIQUE COMMENT '英文单词/短语',
  translation TEXT          NOT NULL COMMENT '中文翻译',
  frequency  INT           NOT NULL DEFAULT 1 COMMENT '查询次数',
  created_at TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_word (word),
  INDEX idx_frequency (frequency DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='翻译记录表';

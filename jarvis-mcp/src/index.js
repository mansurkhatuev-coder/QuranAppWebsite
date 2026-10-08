#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { loadPackageEnv } from './env.js';
import { formatAnalytics, formatFeedback, formatFeedbackStats, publicError } from './format.js';
import { fetchAcademyFeedback, fetchAnalyticsDashboard, fetchFeedbackStats } from './queries.js';

loadPackageEnv();

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

const server = new McpServer(
  { name: 'waydean-jarvis', version: '1.0.0' },
  {
    instructions:
      'Только чтение аналитики приложения и отзывов академии. Не публикуй контент, не меняй данные и не загружай CSV.',
  }
);

function toolResult(text) {
  return { content: [{ type: 'text', text }] };
}

function toolFailure(error, kind) {
  return {
    isError: true,
    content: [{ type: 'text', text: publicError(error, kind) }],
  };
}

server.registerTool(
  'get_analytics_summary',
  {
    title: 'Сводка аналитики',
    description:
      'Сводка аналитики приложения: активные, новые установки, установки за всё время, события, азкары, уроки, открытия, тасбих. days — дни (по умолчанию 7, 0 = всё время). Только чтение, RPC analytics_dashboard.',
    inputSchema: {
      days: z
        .number()
        .int()
        .min(0)
        .max(3650)
        .optional()
        .describe('Период в днях. По умолчанию 7. 0 — за всё время.'),
    },
    annotations: readOnly,
  },
  async ({ days }) => {
    try {
      const data = await fetchAnalyticsDashboard(days);
      return toolResult(formatAnalytics(data));
    } catch (error) {
      return toolFailure(error, 'analytics');
    }
  }
);

server.registerTool(
  'list_academy_feedback',
  {
    title: 'Отзывы академии',
    description:
      'Последние отзывы academy_course_feedback: оценка, комментарий, course_id, платформа, дата. limit до 50 (по умолчанию 20), необязательный min_rating 1–5. Только чтение.',
    inputSchema: {
      limit: z.number().int().min(1).max(50).optional().describe('Сколько отзывов вернуть. По умолчанию 20, максимум 50.'),
      min_rating: z.number().int().min(1).max(5).optional().describe('Минимальная оценка от 1 до 5.'),
    },
    annotations: readOnly,
  },
  async ({ limit, min_rating: minRating }) => {
    try {
      const rows = await fetchAcademyFeedback({ limit, minRating });
      return toolResult(formatFeedback(rows));
    } catch (error) {
      return toolFailure(error, 'feedback');
    }
  }
);

server.registerTool(
  'get_feedback_stats',
  {
    title: 'Оценки академии',
    description:
      'Количество отзывов академии и средняя оценка. Необязательный min_rating 1–5. Только чтение.',
    inputSchema: {
      min_rating: z.number().int().min(1).max(5).optional().describe('Считать только оценки не ниже этого числа.'),
    },
    annotations: readOnly,
  },
  async ({ min_rating: minRating }) => {
    try {
      const stats = await fetchFeedbackStats({ minRating });
      return toolResult(formatFeedbackStats(stats));
    } catch (error) {
      return toolFailure(error, 'feedback');
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('waydean-jarvis-mcp listening on stdio');

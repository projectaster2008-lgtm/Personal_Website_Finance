/**
 * HTTP layer.
 *
 * Routes do three things and nothing else: validate input, call a service, shape
 * a response. No financial logic lives here — if a calculation appears in this
 * file, it is in the wrong place.
 *
 * Every route below `/api` except the auth endpoints is behind `requireAuth`, and
 * every service call takes `user.id` as its first argument. That is the row-level
 * isolation from section 35, enforced in one place.
 */
import { Router } from 'express';
import {
  createAccountSchema,
  createAdjustmentSchema,
  createBudgetSchema,
  createCategorySchema,
  createGoalSchema,
  createLiabilitySchema,
  createReconciliationSchema,
  createRecurringSchema,
  createTransactionSchema,
  importCommitSchema,
  importPreviewSchema,
  loginSchema,
  periodQuerySchema,
  refreshSchema,
  registerSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
  transactionQuerySchema,
  updateAccountSchema,
  updateBudgetSchema,
  updateCategorySchema,
  updateGoalSchema,
  updateLiabilitySchema,
  updateProfileSchema,
  updateRecurringSchema,
  updateTransactionSchema,
} from '@pfos/shared';
import { asyncHandler, param, queryParam } from '../lib/http.js';
import { currentUser, requireAuth } from '../middleware/auth.js';
import { validate, validatedQuery } from '../middleware/validate.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { badRequest } from '../lib/errors.js';
import { todayInTimezone } from '../lib/date.js';
import * as auth from '../services/authService.js';
import * as catalog from '../services/catalogService.js';
import * as transactions from '../services/transactionService.js';
import * as reports from '../services/reportService.js';
import * as planning from '../services/planningService.js';
import * as io from '../services/importExportService.js';
import { prisma } from '../lib/prisma.js';
import { isProduction } from '../config/env.js';

export const router = Router();

/* ----------------------------------------------------------------- auth --- */

const authRouter = Router();

authRouter.post(
  '/register',
  authLimiter,
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await auth.register(req.body));
  }),
);

authRouter.post(
  '/login',
  authLimiter,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    res.json(await auth.login(req.body.email, req.body.password));
  }),
);

authRouter.post(
  '/refresh',
  validate(refreshSchema),
  asyncHandler(async (req, res) => {
    res.json(await auth.refresh(req.body.refreshToken));
  }),
);

authRouter.post(
  '/logout',
  validate(refreshSchema),
  asyncHandler(async (req, res) => {
    await auth.logout(req.body.refreshToken);
    res.status(204).end();
  }),
);

authRouter.post(
  '/password/forgot',
  authLimiter,
  validate(requestPasswordResetSchema),
  asyncHandler(async (req, res) => {
    const token = await auth.requestPasswordReset(req.body.email);
    // Always the same response, so the endpoint cannot be used to discover
    // which email addresses have accounts.
    res.json({
      message: 'If that email has an account, a reset link is on its way.',
      ...(isProduction ? {} : { devToken: token }),
    });
  }),
);

authRouter.post(
  '/password/reset',
  authLimiter,
  validate(resetPasswordSchema),
  asyncHandler(async (req, res) => {
    await auth.resetPassword(req.body.token, req.body.password);
    res.json({ message: 'Password updated. Sign in with your new password.' });
  }),
);

router.use('/auth', authRouter);

/* ------------------------------------------------------- everything else --- */

const api = Router();
api.use(requireAuth);

/* me */
api.get(
  '/me',
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    res.json(auth.toUserDto(row));
  }),
);

api.patch(
  '/me',
  validate(updateProfileSchema),
  asyncHandler(async (req, res) => {
    res.json(await auth.updateProfile(currentUser(req).id, req.body));
  }),
);

api.post(
  '/me/logout-all',
  asyncHandler(async (req, res) => {
    await auth.logoutEverywhere(currentUser(req).id);
    res.status(204).end();
  }),
);

/* accounts */
api.get(
  '/accounts',
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    res.json(await catalog.listAccounts(user.id, user.timezone, req.query.includeInactive === 'true'));
  }),
);

api.get(
  '/accounts/:id',
  validate(periodQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const period = reports.periodFor(user, validatedQuery(req));
    res.json(await catalog.getAccountDetail(user.id, param(req, 'id'), user.timezone, period));
  }),
);

api.post(
  '/accounts',
  validate(createAccountSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await catalog.createAccount(currentUser(req).id, req.body));
  }),
);

api.patch(
  '/accounts/:id',
  validate(updateAccountSchema),
  asyncHandler(async (req, res) => {
    res.json(await catalog.updateAccount(currentUser(req).id, param(req, 'id'), req.body));
  }),
);

api.delete(
  '/accounts/:id',
  asyncHandler(async (req, res) => {
    await catalog.deleteAccount(currentUser(req).id, param(req, 'id'));
    res.status(204).end();
  }),
);

/* categories */
api.get(
  '/categories',
  asyncHandler(async (req, res) => {
    res.json(await catalog.listCategories(currentUser(req).id, req.query.includeInactive === 'true'));
  }),
);

api.post(
  '/categories',
  validate(createCategorySchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await catalog.createCategory(currentUser(req).id, req.body));
  }),
);

api.patch(
  '/categories/:id',
  validate(updateCategorySchema),
  asyncHandler(async (req, res) => {
    res.json(await catalog.updateCategory(currentUser(req).id, param(req, 'id'), req.body));
  }),
);

api.delete(
  '/categories/:id',
  asyncHandler(async (req, res) => {
    await catalog.deleteCategory(currentUser(req).id, param(req, 'id'));
    res.status(204).end();
  }),
);

/* transactions */
api.get(
  '/transactions',
  validate(transactionQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    res.json(await transactions.listTransactions(currentUser(req).id, validatedQuery(req)));
  }),
);

api.get(
  '/transactions/:id',
  asyncHandler(async (req, res) => {
    res.json(await transactions.getTransaction(currentUser(req).id, param(req, 'id')));
  }),
);

api.post(
  '/transactions',
  validate(createTransactionSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await transactions.createTransaction(currentUser(req).id, req.body));
  }),
);

api.put(
  '/transactions/:id',
  validate(updateTransactionSchema),
  asyncHandler(async (req, res) => {
    res.json(await transactions.updateTransaction(currentUser(req).id, param(req, 'id'), req.body));
  }),
);

api.post(
  '/transactions/:id/duplicate',
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const date = typeof req.body?.date === 'string' ? req.body.date : todayInTimezone(user.timezone);
    res.status(201).json(await transactions.duplicateTransaction(user.id, param(req, 'id'), date));
  }),
);

api.delete(
  '/transactions/:id',
  asyncHandler(async (req, res) => {
    await transactions.deleteTransaction(currentUser(req).id, param(req, 'id'));
    res.status(204).end();
  }),
);

/* reports */
api.get(
  '/dashboard',
  validate(periodQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    res.json(await reports.getDashboard(currentUser(req), validatedQuery(req)));
  }),
);

api.get(
  '/reports/income-statement',
  validate(periodQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    res.json(await reports.getIncomeStatement(currentUser(req), validatedQuery(req)));
  }),
);

api.get(
  '/reports/cash-flow',
  validate(periodQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    res.json(await reports.getCashFlow(currentUser(req), validatedQuery(req)));
  }),
);

api.get(
  '/reports/balance-sheet',
  validate(periodQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    res.json(await reports.getBalanceSheet(currentUser(req), validatedQuery(req)));
  }),
);

api.get(
  '/reports/net-worth-changes',
  validate(periodQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    res.json(await reports.getChangesInNetWorth(currentUser(req), validatedQuery(req)));
  }),
);

api.get(
  '/reports/net-worth-history',
  asyncHandler(async (req, res) => {
    const months = Number(req.query.months ?? 12);
    if (![3, 6, 12, 24, 120].includes(months)) {
      throw badRequest('months must be one of 3, 6, 12, 24 or 120');
    }
    res.json(await reports.getNetWorthHistory(currentUser(req), months));
  }),
);

api.get(
  '/reports/integrity',
  validate(periodQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    res.json(await reports.getIntegrityReport(currentUser(req), validatedQuery(req)));
  }),
);

/* budgets */
api.get(
  '/budgets',
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const month = queryParam(req, 'month');
    res.json(await planning.listBudgets(user.id, user.timezone, month));
  }),
);

api.post(
  '/budgets',
  validate(createBudgetSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await planning.upsertBudget(currentUser(req).id, req.body));
  }),
);

api.patch(
  '/budgets/:id',
  validate(updateBudgetSchema),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const existing = await prisma.budget.findFirstOrThrow({ where: { id: param(req, 'id'), userId: user.id } });
    res.json(
      await planning.upsertBudget(user.id, {
        categoryId: req.body.categoryId ?? existing.categoryId,
        amountMinor: req.body.amountMinor ?? existing.amountMinor,
        period: req.body.period ?? existing.period,
        startDate: req.body.startDate ?? existing.startDate.toISOString().slice(0, 10),
        endDate: req.body.endDate,
        rollover: req.body.rollover,
        notes: req.body.notes,
      }),
    );
  }),
);

api.delete(
  '/budgets/:id',
  asyncHandler(async (req, res) => {
    await planning.deleteBudget(currentUser(req).id, param(req, 'id'));
    res.status(204).end();
  }),
);

/* goals */
api.get(
  '/goals',
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    res.json(await planning.listGoals(user.id, user.timezone, req.query.includeArchived === 'true'));
  }),
);

api.post(
  '/goals',
  validate(createGoalSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await planning.createGoal(currentUser(req).id, req.body));
  }),
);

api.patch(
  '/goals/:id',
  validate(updateGoalSchema),
  asyncHandler(async (req, res) => {
    res.json(await planning.updateGoal(currentUser(req).id, param(req, 'id'), req.body));
  }),
);

api.delete(
  '/goals/:id',
  asyncHandler(async (req, res) => {
    await planning.deleteGoal(currentUser(req).id, param(req, 'id'));
    res.status(204).end();
  }),
);

/* recurring */
api.get(
  '/recurring',
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    res.json(await planning.listRecurring(user.id, user.timezone));
  }),
);

api.get(
  '/recurring/upcoming',
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    res.json(await planning.listUpcoming(user.id, user.timezone, Number(req.query.days ?? 30)));
  }),
);

api.post(
  '/recurring',
  validate(createRecurringSchema),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const created = await prisma.recurringRule.create({
      data: {
        ...req.body,
        userId: user.id,
        startDate: new Date(`${req.body.startDate}T00:00:00.000Z`),
        endDate: req.body.endDate ? new Date(`${req.body.endDate}T00:00:00.000Z`) : null,
      },
    });
    res.status(201).json(created);
  }),
);

api.patch(
  '/recurring/:id',
  validate(updateRecurringSchema),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    await prisma.recurringRule.findFirstOrThrow({ where: { id: param(req, 'id'), userId: user.id } });
    res.json(
      await prisma.recurringRule.update({
        where: { id: param(req, 'id') },
        data: {
          ...req.body,
          endDate: req.body.endDate ? new Date(`${req.body.endDate}T00:00:00.000Z`) : undefined,
        },
      }),
    );
  }),
);

api.delete(
  '/recurring/:id',
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    await prisma.recurringRule.findFirstOrThrow({ where: { id: param(req, 'id'), userId: user.id } });
    await prisma.recurringRule.delete({ where: { id: param(req, 'id') } });
    res.status(204).end();
  }),
);

api.post(
  '/recurring/run-due',
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    res.json(await planning.materialiseDueRecurring(user.id, user.timezone));
  }),
);

/* liabilities and adjustments */
api.get('/liabilities', asyncHandler(async (req, res) => {
  res.json(await planning.listLiabilities(currentUser(req).id));
}));

api.post('/liabilities', validate(createLiabilitySchema), asyncHandler(async (req, res) => {
  res.status(201).json(await planning.createLiability(currentUser(req).id, req.body));
}));

api.patch('/liabilities/:id', validate(updateLiabilitySchema), asyncHandler(async (req, res) => {
  res.json(await planning.updateLiability(currentUser(req).id, param(req, 'id'), req.body));
}));

api.delete('/liabilities/:id', asyncHandler(async (req, res) => {
  await planning.deleteLiability(currentUser(req).id, param(req, 'id'));
  res.status(204).end();
}));

api.get('/adjustments', asyncHandler(async (req, res) => {
  res.json(await planning.listAdjustments(currentUser(req).id));
}));

api.post('/adjustments', validate(createAdjustmentSchema), asyncHandler(async (req, res) => {
  res.status(201).json(await planning.createAdjustment(currentUser(req).id, req.body));
}));

api.delete('/adjustments/:id', asyncHandler(async (req, res) => {
  await planning.deleteAdjustment(currentUser(req).id, param(req, 'id'));
  res.status(204).end();
}));

/* reconciliation */
api.get(
  '/reconciliations',
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    res.json(await planning.listReconciliations(user.id, user.timezone, Number(req.query.weeks ?? 8)));
  }),
);

api.post(
  '/reconciliations',
  validate(createReconciliationSchema),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    res.status(201).json(await planning.upsertReconciliation(user.id, req.body, user.weekStartsOn));
  }),
);

api.delete(
  '/reconciliations/:id',
  asyncHandler(async (req, res) => {
    await planning.deleteReconciliation(currentUser(req).id, param(req, 'id'));
    res.status(204).end();
  }),
);

/* import / export */
api.post(
  '/import/preview',
  validate(importPreviewSchema),
  asyncHandler(async (req, res) => {
    res.json(
      await io.previewImport(currentUser(req).id, req.body.csv, req.body.delimiter, req.body.hasHeader),
    );
  }),
);

api.post(
  '/import/commit',
  validate(importCommitSchema),
  asyncHandler(async (req, res) => {
    res.json(await io.commitImport(currentUser(req).id, req.body));
  }),
);

api.get(
  '/export/transactions.csv',
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const csv = await io.exportTransactionsCsv(
      user.id,
      queryParam(req, 'from'),
      queryParam(req, 'to'),
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="general-ledger.csv"');
    res.send(csv);
  }),
);

api.get(
  '/export/transactions.xlsx',
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const buffer = await io.exportTransactionsXlsx(
      user.id,
      queryParam(req, 'from'),
      queryParam(req, 'to'),
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', 'attachment; filename="general-ledger.xlsx"');
    res.send(buffer);
  }),
);

router.use('/', api);

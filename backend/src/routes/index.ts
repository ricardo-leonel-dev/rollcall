import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { institutionMiddleware } from '../middleware/institution.middleware';

import authRouter            from '../controllers/auth.controller';
import academicYearRouter    from '../controllers/academic-year.controller';
import courseRouter          from '../controllers/course.controller';
import courseAYRouter        from '../controllers/course-academic-year.controller';
import guardianRouter        from '../controllers/guardian.controller';
import studentRouter         from '../controllers/student.controller';
import enrollmentRouter      from '../controllers/enrollment.controller';
import absenceRouter         from '../controllers/absence.controller';
import justificationRouter   from '../controllers/justification.controller';
import roleRouter            from '../controllers/role.controller';
import userRouter            from '../controllers/user.controller';
import dashboardRouter       from '../controllers/dashboard.controller';
import importRouter          from '../controllers/import.controller';
import exportRouter          from '../controllers/export.controller';
import institutionRouter     from '../controllers/institution.controller';
import ocrRouter             from '../controllers/ocr.controller';

const router = Router();

// Health (no auth)
router.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Auth (login is public)
router.use('/auth', authRouter);

// All protected routes require JWT + a resolved institution context
router.use(authMiddleware);
router.use(institutionMiddleware);

router.use('/academic-years',       academicYearRouter);
router.use('/courses',              courseRouter);
router.use('/course-academic-year', courseAYRouter);
router.use('/guardians',            guardianRouter);
router.use('/students',             studentRouter);
router.use('/enrollments',          enrollmentRouter);
router.use('/absences',             absenceRouter);
router.use('/justifications',       justificationRouter);
router.use('/roles',                roleRouter);
router.use('/role-permissions',     roleRouter);  // role.controller handles /permissions/:id
router.use('/users',                userRouter);
router.use('/dashboard',            dashboardRouter);
router.use('/import',               importRouter);
router.use('/export',               exportRouter);
router.use('/institutions',         institutionRouter);
router.use('/ocr',                  ocrRouter);

export default router;

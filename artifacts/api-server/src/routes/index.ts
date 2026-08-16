import { Router, type IRouter } from "express";
import healthRouter from "./health";
import stocksRouter from "./stocks";
import userRouter from "./user.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(stocksRouter);
router.use(userRouter);

export default router;

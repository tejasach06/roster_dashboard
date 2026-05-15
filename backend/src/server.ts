import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth';
import teamRoutes from './routes/teams';
import rosterRoutes from './routes/roster';
import userRoutes from './routes/users';
import employeeRoutes from './routes/employees';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/roster', rosterRoutes);
app.use('/api/users', userRoutes);
app.use('/api/employees', employeeRoutes);

app.listen(PORT, () => {
  console.log(`Roster backend running on http://localhost:${PORT}`);
});

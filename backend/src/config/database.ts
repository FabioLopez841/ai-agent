import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
import pg from 'pg';
dotenv.config();

const useSSL = process.env.DB_SSL !== 'false';

const sequelize = process.env.DATABASE_URL
  ? new Sequelize(process.env.DATABASE_URL, {
      dialect: 'postgres',
      dialectModule: pg,
      logging: false,
      dialectOptions: useSSL ? {
        ssl: { require: true, rejectUnauthorized: false },
      } : {},
    })
  : new Sequelize({
      dialect: 'postgres',
      dialectModule: pg,
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_NAME || 'aiagentbuilder',
      username: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      logging: false,
      dialectOptions: useSSL ? {
        ssl: { require: true, rejectUnauthorized: false },
      } : {},
    });

export default sequelize;
/**
 * Knex Configuration
 * Database migration and query builder configuration
 * @module knexfile
 */

require('dotenv').config();

module.exports = {
    development: {
        client: 'pg',
        connection: {
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT) || 5432,
            user: process.env.DB_USER || 'shoukaku',
            password: process.env.DB_PASSWORD || 'shoukaku_secret',
            database: process.env.DB_NAME || 'shoukaku_db',
        },
        pool: {
            min: 2,
            max: 10,
        },
        migrations: {
            directory: './migrations',
            tableName: 'knex_migrations',
        },
        seeds: {
            directory: './seeds',
        },
    },

    production: {
        client: 'pg',
        connection: {
            host: process.env.DB_HOST,
            port: parseInt(process.env.DB_PORT) || 5432,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
        },
        pool: {
            min: 2,
            max: 15,
        },
        migrations: {
            directory: './migrations',
            tableName: 'knex_migrations',
        },
        acquireConnectionTimeout: 10000,
    },

    // For running migrations in Docker
    docker: {
        client: 'pg',
        connection: {
            host: 'postgres',
            port: 5432,
            user: process.env.DB_USER || 'shoukaku',
            password: process.env.DB_PASSWORD || 'shoukaku_secret',
            database: process.env.DB_NAME || 'shoukaku_db',
        },
        pool: {
            min: 2,
            max: 10,
        },
        migrations: {
            directory: './migrations',
            tableName: 'knex_migrations',
        },
    },
};

module.exports = {
  apps: [
    {
      name: 'roster-backend',
      script: 'dist/server.js',
      cwd: './backend',

      // Load .env before any module runs (dotenv.config() in server.ts is too late)
      node_args: '--require dotenv/config',

      // SQLite is single-writer — do not increase instances
      instances: 1,
      exec_mode: 'fork',

      // Restart automatically if the process crashes
      autorestart: true,
      watch: false,
      max_memory_restart: '256M',

      // Log files (relative to cwd)
      out_file: '../logs/pm2-out.log',
      error_file: '../logs/pm2-error.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
    },
  ],
};

module.exports = {
  apps: [
    {
      name: 'stallionadmin',
      script: './server/static-server.cjs',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      env_production: {
        NODE_ENV: 'production',
        HOST: '0.0.0.0',
        PORT: 4200,
      },
      out_file: '/dev/null',
      error_file: '/dev/null',
      merge_logs: true,
      time: false,
    },
  ],
};

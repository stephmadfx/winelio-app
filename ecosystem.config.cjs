module.exports = {
  apps: [
    {
      name: "winelio",
      script: "./scripts/pm2-winelio-dev.sh",
      cwd: "/Users/steph/PROJETS/WINELIO/winelio",
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      restart_delay: 2000,
      exp_backoff_restart_delay: 100,
      max_memory_restart: "1G",
      kill_timeout: 5000,
      listen_timeout: 10000,
      env: {
        NODE_ENV: "development",
      },
    },
  ],
};

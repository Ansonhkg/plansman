module.exports = {
  apps: [
    {
      name: "plansman-api",
      cwd: __dirname,
      script: "bun",
      args: "run dev:api",
      env: {
        NODE_ENV: "development",
      },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 1000,
    },
    {
      name: "plansman-web",
      cwd: __dirname,
      script: "bun",
      args: "run dev:web",
      env: {
        NODE_ENV: "development",
      },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 1000,
    },
  ],
};

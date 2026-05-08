module.exports = {
  apps: [
    {
      name: 'copa-web',
      cwd: './apps/web',
      script: 'npm',
      args: 'start',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    },
    {
      name: 'copa-api',
      cwd: './apps/api',
      script: 'node',
      args: 'index.js',
      env: {
        NODE_ENV: 'production',
        PORT: 4000
      }
    }
  ]
};

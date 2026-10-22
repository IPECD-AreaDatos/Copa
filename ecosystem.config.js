module.exports = {
  apps: [
    {
      name: 'copa-web-test',
      cwd: './apps/web',
      script: 'npm',
      args: 'start',
      interpreter: '/home/ubuntu/.nvm/versions/node/v22.23.1/bin/node',
      env: {
        NODE_ENV: 'production',
        PORT: 3007,
        PATH: '/home/ubuntu/.nvm/versions/node/v22.23.1/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
      }
    },
    {
      name: 'copa-api-test',
      cwd: './apps/api',
      script: 'index.js',
      interpreter: '/home/ubuntu/.nvm/versions/node/v22.23.1/bin/node',
      env: {
        NODE_ENV: 'production',
        PORT: 4001
      }
    }
  ]
};

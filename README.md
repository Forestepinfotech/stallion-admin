# Stallionadmin

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 19.1.5.

## Production deployment

The frontend is built as a static Angular SPA and is configured to be served from `https://stallionauto.com/admin/`.

1. Copy `.env.example` to `.env` and set the real auth values.
2. For production builds, keep `IS_SERVER=true`. That generates `src/assets/runtime-config.json` with `https://stallionauto.com/apis` by default.
3. For local development, set `IS_SERVER=false`. That keeps API calls on `http://localhost:3002`.
4. Run `npm ci`.
5. Run `npm run build`.
6. Run `npm run pm2:start`.

`npm run build` uses Angular production mode with `--base-href /admin/`, so the generated `index.html`, JS, CSS, and asset URLs are all rooted under `/admin/`.

PM2 serves the compiled frontend on port `4300` through [ecosystem.config.cjs](/Users/mac/Desktop/NATIVE_IOS/VarinderCuApps/stallion-admin-main/ecosystem.config.cjs). Production PM2 stdout/stderr logs are disabled there, and `APP_BASE_PATH=/admin` lets the static server resolve `/admin/*` requests correctly.

### Nginx on the main droplet

DNS should point `stallionauto.com` to the main droplet. That droplet should reverse proxy:

- `/admin/` to the admin droplet
- `/apis/` to the API droplet

This repo includes an example site config at [deploy/nginx/stallionadmin.conf](/Users/mac/Desktop/NATIVE_IOS/VarinderCuApps/stallion-admin-main/deploy/nginx/stallionadmin.conf).

Typical setup on Ubuntu/Debian:

```bash
sudo apt update
sudo apt install -y nginx
sudo cp deploy/nginx/stallionadmin.conf /etc/nginx/sites-available/stallionadmin.conf
sudo ln -sf /etc/nginx/sites-available/stallionadmin.conf /etc/nginx/sites-enabled/stallionadmin.conf
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

Replace `admin_droplet_ip_or_dns` and `api_droplet_ip_or_dns` in the sample config before enabling it.

### Refresh handling under `/admin`

Angular route refreshes such as `/admin/dashboard` and `/admin/orders` work when both layers behave like an SPA:

1. The app is built with `base href /admin/`.
2. The main Nginx server forwards `/admin/*` to the admin droplet.
3. The admin droplet serves `index.html` for unknown frontend routes.

The included `server/static-server.cjs` already falls back to `index.html`, so refreshes do not return `404` as long as requests reach the admin droplet.

If you want HTTPS, point your domain to the droplet and then run:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d stallionauto.com -d www.stallionauto.com
```

## Development server

To start a local development server, run:

```bash
npm run dev:config
```

Once the server is running, open your browser and navigate to `http://localhost:4300/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
npm run build
```

This compiles the app into `dist/` with `/admin/` as the deploy base path and with production API calls targeting `https://stallionauto.com/apis` unless `PRODUCTION_API_BASE_URL` overrides it.

## Running unit tests

To execute unit tests with the [Karma](https://karma-runner.github.io) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.

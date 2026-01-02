import fs from 'fs/promises';
import path from 'path';

async function writeFileIfMissing(filePath: string, contents: string) {
  try {
    await fs.access(filePath);
    return;
  } catch {
    // continue
  }
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, contents, 'utf8');
}

export async function scaffoldBasicNextApp(
  projectPath: string,
  projectId: string
) {
  await fs.mkdir(projectPath, { recursive: true });

  const packageJson = {
    name: projectId,
    private: true,
    version: '0.1.0',
    scripts: {
      dev: 'node scripts/run-dev.js',
      build: 'next build',
      start: 'next start',
      lint: 'next lint',
    },
    dependencies: {
      '@heroicons/react': '^2.2.0',
      next: '15.1.0',
      react: '19.0.0',
      'react-dom': '19.0.0',
      postcss: '^8.4.49',
      autoprefixer: '^10.4.20',
      tailwindcss: '^3.4.19',
      clsx: '^2.1.1',
      // Dev dependencies also included here for global availability
      typescript: '^5.7.2',
      '@types/react': '^19.0.0',
      '@types/react-dom': '^19.0.0',
      '@types/node': '^22.10.0',
      eslint: '^9.17.0',
      'eslint-config-next': '15.1.0'
    },
    devDependencies: {},
  };

  await writeFileIfMissing(
    path.join(projectPath, 'package.json'),
    `${JSON.stringify(packageJson, null, 2)}\n`
  );

  await writeFileIfMissing(
    path.join(projectPath, 'next.config.js'),
    `/** @type {import('next').NextConfig} */
const nextConfig = {
  // Remove experimental typedRoutes for now
};

module.exports = nextConfig;
`
  );

  await writeFileIfMissing(
    path.join(projectPath, 'postcss.config.js'),
    `module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
`
  );

  await writeFileIfMissing(
    path.join(projectPath, 'tailwind.config.js'),
    `/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
`
  );

  await writeFileIfMissing(
    path.join(projectPath, 'tsconfig.json'),
    `{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{"name": "next"}],
     "baseUrl": ".",
    "paths": {
      "@/*": ["./*"],
      "@/components/*": ["./components/*"],
      "@/lib/*": ["./lib/*"],
      "@/types/*": ["./types/*"],
      "@/data/*": ["./data/*"]
    }
  },
  "include": ["**/*.ts", "**/*.tsx", "next-env.d.ts", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
`
  );

  await writeFileIfMissing(
    path.join(projectPath, 'next-env.d.ts'),
    `/// <reference types="next" />
/// <reference types="next/navigation-types/navigation" />
/// <reference types="next/image-types/global" />

// NOTE: This file should not be edited
// see https://nextjs.org/docs/basic-features/typescript for more information.
`
  );

  await writeFileIfMissing(
    path.join(projectPath, 'app/layout.tsx'),
    `import type { ReactNode } from 'react';
import './globals.css';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`
  );

  await writeFileIfMissing(
    path.join(projectPath, 'app/page.tsx'),
    `export default function Home() {
  return (
    <div style={{
      display: 'grid',
      gridTemplateRows: '20px 1fr 20px',
      alignItems: 'center',
      justifyItems: 'center',
      minHeight: '100vh',
      padding: '80px',
      gap: '64px',
      fontFamily: 'var(--font-geist-sans)',
    }}>
      <main style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '32px',
        gridRow: 2,
        alignItems: 'center',
      }}>
        <h1 style={{
          fontSize: '3rem',
          fontWeight: 600,
          textAlign: 'center',
        }}>
          Get started by editing
        </h1>
        <code style={{
          fontFamily: 'monospace',
          fontSize: '1rem',
          padding: '12px 20px',
          background: 'rgba(0, 0, 0, 0.05)',
          borderRadius: '8px',
        }}>
          app/page.tsx
        </code>
      </main>
      <footer style={{
        gridRow: 3,
        display: 'flex',
        gap: '24px',
        flexWrap: 'wrap',
        justifyContent: 'center',
      }}>
        <a
          href="https://nextjs.org/learn"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            textDecoration: 'none',
            color: 'inherit',
          }}
        >
          Learn →
        </a>
        <a
          href="https://vercel.com/templates"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            textDecoration: 'none',
            color: 'inherit',
          }}
        >
          Examples →
        </a>
        <a
          href="https://nextjs.org"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            textDecoration: 'none',
            color: 'inherit',
          }}
        >
          Next.js →
        </a>
      </footer>
    </div>
  );
}
`
  );

  await writeFileIfMissing(
    path.join(projectPath, 'app/globals.css'),
    `@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  color-scheme: light;
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
}
`
  );

  await writeFileIfMissing(
    path.join(projectPath, 'scripts/run-dev.js'),
    `#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const isWindows = process.platform === 'win32';

function parseCliArgs(argv) {
  const passthrough = [];
  let preferredPort;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--port' || arg === '-p') {
      const value = argv[i + 1];
      if (value && !value.startsWith('-')) {
        const parsed = Number.parseInt(value, 10);
        if (!Number.isNaN(parsed)) {
          preferredPort = parsed;
        }
        i += 1;
        continue;
      }
    } else if (arg.startsWith('--port=')) {
      const value = arg.slice('--port='.length);
      const parsed = Number.parseInt(value, 10);
      if (!Number.isNaN(parsed)) {
        preferredPort = parsed;
      }
      continue;
    } else if (arg.startsWith('-p=')) {
      const value = arg.slice('-p='.length);
      const parsed = Number.parseInt(value, 10);
      if (!Number.isNaN(parsed)) {
        preferredPort = parsed;
      }
      continue;
    }

    passthrough.push(arg);
  }

  return { preferredPort, passthrough };
}

function resolvePort(preferredPort) {
  const candidates = [
    preferredPort,
    process.env.PORT,
    process.env.WEB_PORT,
    process.env.PREVIEW_PORT_START,
    3100,
  ];

  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) {
      continue;
    }

    const numeric =
      typeof candidate === 'number'
        ? candidate
        : Number.parseInt(String(candidate), 10);

    if (!Number.isNaN(numeric) && numeric > 0 && numeric <= 65535) {
      return numeric;
    }
  }

  return 3100;
}

(async () => {
  const argv = process.argv.slice(2);
  const { preferredPort, passthrough } = parseCliArgs(argv);
  const port = resolvePort(preferredPort);
  const url =
    process.env.NEXT_PUBLIC_APP_URL || \`http://localhost:\${port}\`;

  process.env.PORT = String(port);
  process.env.WEB_PORT = String(port);
  process.env.NEXT_PUBLIC_APP_URL = url;

  console.debug(\`🚀 Starting Next.js dev server on \${url}\`);

  const nextBin = path.join(projectRoot, 'node_modules', '.bin', isWindows ? 'next.cmd' : 'next');
  const useLocalBin = fs.existsSync(nextBin);

  const child = spawn(
    useLocalBin ? nextBin : 'npx',
    useLocalBin ? ['dev', '--port', String(port), ...passthrough] : ['next', 'dev', '--port', String(port), ...passthrough],
    {
      cwd: projectRoot,
      stdio: 'inherit',
      shell: isWindows,
      env: {
        ...process.env,
        PORT: String(port),
        WEB_PORT: String(port),
        NEXT_PUBLIC_APP_URL: url,
        NEXT_TELEMETRY_DISABLED: '1',
      },
    }
  );

  // Handle termination signals to ensure child process is killed
  const cleanup = () => {
    console.debug('🛑 Stopping Next.js dev server...');
    // Ask nicely first
    child.kill('SIGTERM');
    
    // Give it a moment, then force kill
    const forceKill = setTimeout(() => {
        try { child.kill('SIGKILL'); } catch(e) {}
        process.exit(0);
    }, 1000); // 1s wait

    // If it exits on its own, clear timeout
    child.once('exit', () => {
        clearTimeout(forceKill);
        process.exit(0);
    });
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  
  // Ensure we don't leave it hanging if we exit for other reasons
  process.on('exit', () => {
      try { child.kill(); } catch(e) {}
  });

  child.on('exit', (code) => {
    if (typeof code === 'number' && code !== 0) {
      console.error(\`❌ Next.js dev server exited with code \${code}\`);
      process.exit(code);
    }
  });

  child.on('error', (error) => {
    console.error('❌ Failed to start Next.js dev server');
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
})();
`
  );
}

export async function scaffoldStaticHtmlApp(
  projectPath: string,
  projectId: string
) {
  await fs.mkdir(projectPath, { recursive: true });

  const packageJson = {
    name: projectId,
    private: true,
    version: '0.1.0',
    scripts: {
      dev: 'node scripts/serve.js',
    },
    devDependencies: {
      serve: '^14.2.0',
    },
  };

  await writeFileIfMissing(
    path.join(projectPath, 'package.json'),
    `${JSON.stringify(packageJson, null, 2)}\n`
  );

  await writeFileIfMissing(
    path.join(projectPath, 'index.html'),
    `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>My Static Site</title>
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <main>
        <h1>Hello World</h1>
        <p>Edit index.html to get started.</p>
    </main>
    <script src="script.js"></script>
</body>
</html>
`
  );

  await writeFileIfMissing(
    path.join(projectPath, 'styles.css'),
    `body {
    font-family: system-ui, -apple-system, sans-serif;
    margin: 0;
    padding: 2rem;
    line-height: 1.5;
}

h1 {
    color: #333;
}
`
  );

  await writeFileIfMissing(
    path.join(projectPath, 'script.js'),
    `console.debug('Script loaded!');
`
  );

  // Universal serve script that detects build outputs and respects PORT
  await writeFileIfMissing(
    path.join(projectPath, 'scripts/serve.js'),
    `#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const projectRoot = path.join(__dirname, '..');
const isWindows = process.platform === 'win32';

// Simple port resolution logic
const port = process.env.PORT || 3000;

// Universal detection: Check common build output directories
// We look for 'index.html' as a strong signal of a build output
const candidates = ['dist', 'build', 'out', 'public'];
let serveTarget = '.';

// 1. Try to find a folder with index.html
for (const dir of candidates) {
  const fullPath = path.join(projectRoot, dir);
  if (fs.existsSync(fullPath) && fs.existsSync(path.join(fullPath, 'index.html'))) {
    serveTarget = dir;
    break;
  }
}

// 2. Prefer root if it contains index.html
// 3. Fallback: If still root, but 'public' exists (even without index.html), prefer public
if (serveTarget === '.') {
  if (fs.existsSync(path.join(projectRoot, 'index.html'))) {
    serveTarget = '.';
  } else if (fs.existsSync(path.join(projectRoot, 'public'))) {
    serveTarget = 'public';
  }
}

console.debug(\`🚀 Starting static file server on port \${port}\`);
console.debug(\`📂 Serving directory: \${serveTarget}\`);

const serveBin = path.join(projectRoot, 'node_modules', '.bin', isWindows ? 'serve.cmd' : 'serve');
const useLocalBin = fs.existsSync(serveBin);

const child = spawn(
  useLocalBin ? serveBin : 'npx',
  useLocalBin ? ['-s', serveTarget, '-p', String(port), '-l', 'tcp://0.0.0.0:' + port] : ['serve', '-s', serveTarget, '-p', String(port), '-l', 'tcp://0.0.0.0:' + port],
  {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: isWindows,
    env: {
      ...process.env,
      PORT: String(port)
    },
  }
);

// Handle termination signals to ensure child process is killed
const cleanup = () => {
  console.debug('🛑 Stopping static server...');
  // Ask nicely first
  child.kill('SIGTERM');
  
  // Give it a moment, then force kill
  const forceKill = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch(e) {}
      process.exit(0);
  }, 500); // 500ms wait is usually enough for 'serve'

  // If it exits on its own, clear timeout
  child.once('exit', () => {
      clearTimeout(forceKill);
      process.exit(0);
  });
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

// Ensure we don't leave it hanging if we exit for other reasons
process.on('exit', () => {
    try { child.kill(); } catch(e) {}
});

child.on('exit', (code) => {
  if (code !== 0) {
    console.error(\`❌ Server exited with code \${code}\`);
    process.exit(code || 1);
  }
});
`
  );

  // Caddyfile
  await writeFileIfMissing(
    path.join(projectPath, 'Caddyfile'),
    `{
    email {$DOMAIN_EMAIL}
}

{$DOMAIN_NAME} {
    root * /usr/share/caddy
    file_server
    encode zstd gzip
    
    log {
        output file /data/access.log {
            roll_size 50MB
            roll_keep 10
            roll_keep_for 720h
        }
    }
}
`
  );

  // Dockerfile
  await writeFileIfMissing(
    path.join(projectPath, 'Dockerfile'),
    `FROM caddy:alpine
COPY . /usr/share/caddy
COPY Caddyfile /etc/caddy/Caddyfile
`
  );

  // docker-compose.yml
  await writeFileIfMissing(
    path.join(projectPath, 'docker-compose.yml'),
    `version: '3'
services:
  web:
    build: .
    ports:
      - "80:80"
      - "443:443"
    environment:
      - DOMAIN_NAME=\${DOMAIN_NAME:-localhost}
      - DOMAIN_EMAIL=\${DOMAIN_EMAIL:-admin@localhost}
`
  );

  // .gitignore
  await writeFileIfMissing(
    path.join(projectPath, '.gitignore'),
    `# Dependencies
node_modules/

# Next.js build output
.next/
out/

# Build artifacts
dist/
build/
.turbo/

# Environment files
.env
.env.*
.claudable/

# Misc
.DS_Store
.git-backup-*
.vercel/
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
`
  );
}

export async function scaffoldFlaskApp(
  projectPath: string,
  projectId: string
) {
  await fs.mkdir(projectPath, { recursive: true });

  // === APP PACKAGE ===
  const appDir = path.join(projectPath, 'app');
  await fs.mkdir(appDir, { recursive: true });

  // app/__init__.py - Application factory
  await writeFileIfMissing(
    path.join(appDir, '__init__.py'),
    `import os
import logging
from logging.handlers import RotatingFileHandler
from flask import Flask
from .config import config
from .extensions import db, migrate

def create_app(config_name='default'):
    app = Flask(__name__)
    
    # Load configuration
    app.config.from_object(config.get(config_name, config['default']))

    # Initialize extensions
    db.init_app(app)
    migrate.init_app(app, db)

    # Register blueprints
    from .routes import main_bp, health_bp
    app.register_blueprint(main_bp)
    app.register_blueprint(health_bp, url_prefix='/api')

    # Register error handlers
    from . import errors
    errors.register_error_handlers(app)

    # Configure logging
    if not app.debug and not app.testing:
        if not os.path.exists('logs'):
            os.mkdir('logs')
        file_handler = RotatingFileHandler('logs/app.log', maxBytes=10240, backupCount=10)
        file_handler.setFormatter(logging.Formatter(
            '%(asctime)s %(levelname)s: %(message)s [in %(pathname)s:%(lineno)d]'))
        file_handler.setLevel(logging.INFO)
        app.logger.addHandler(file_handler)
        app.logger.setLevel(logging.INFO)
        app.logger.info('App startup')

    return app
`
  );

  // app/config.py - Configuration
  await writeFileIfMissing(
    path.join(appDir, 'config.py'),
    `import os
from dotenv import load_dotenv

# Load .env file from the root directory
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')
    
    # Instance folder for the database
    BASE_DIR = os.path.abspath(os.path.dirname(__file__))
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL', 
        'sqlite:///' + os.path.join(BASE_DIR, '..', 'instance', 'app.db'))
    
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    UPLOAD_FOLDER = os.path.join(BASE_DIR, '..', 'uploads')
    
    # Security headers
    SESSION_COOKIE_HTTPONLY = True
    REMEMBER_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'


class DevelopmentConfig(Config):
    DEBUG = True


class ProductionConfig(Config):
    DEBUG = False
    # In production, ensure SECRET_KEY is set via environment variable
    SESSION_COOKIE_SECURE = True
    REMEMBER_COOKIE_SECURE = True


class TestingConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = 'sqlite:///:memory:'


config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'testing': TestingConfig,
    'default': DevelopmentConfig
}
`
  );

  // app/extensions.py - Flask extensions
  await writeFileIfMissing(
    path.join(appDir, 'extensions.py'),
    `from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate

db = SQLAlchemy()
migrate = Migrate()
`
  );

  // app/errors.py - Error handlers
  await writeFileIfMissing(
    path.join(appDir, 'errors.py'),
    `from flask import render_template

def register_error_handlers(app):
    @app.errorhandler(403)
    def forbidden(e):
        return render_template('pages/403.html'), 403

    @app.errorhandler(404)
    def page_not_found(e):
        return render_template('pages/404.html'), 404

    @app.errorhandler(500)
    def internal_server_error(e):
        return render_template('pages/500.html'), 500
`
  );

  // === MODELS ===
  const modelsDir = path.join(appDir, 'models');
  await fs.mkdir(modelsDir, { recursive: true });

  await writeFileIfMissing(
    path.join(modelsDir, '__init__.py'),
    `from .user import User

__all__ = ['User']
`
  );

  await writeFileIfMissing(
    path.join(modelsDir, 'user.py'),
    `from app.extensions import db
from datetime import datetime

class User(db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f'<User {self.username}>'
    
    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'created_at': self.created_at.isoformat()
        }
`
  );

  // === ROUTES ===
  const routesDir = path.join(appDir, 'routes');
  await fs.mkdir(routesDir, { recursive: true });

  await writeFileIfMissing(
    path.join(routesDir, '__init__.py'),
    `from .main import main_bp
from .health import health_bp

__all__ = ['main_bp', 'health_bp']
`
  );

  await writeFileIfMissing(
    path.join(routesDir, 'main.py'),
    `from flask import Blueprint, render_template

main_bp = Blueprint('main', __name__)

@main_bp.route('/')
def home():
    return render_template('pages/home.html', title='Home')

@main_bp.route('/login')
def login():
    return render_template('pages/login.html', title='Login')

@main_bp.route('/dashboard')
def dashboard():
    return render_template('pages/dashboard.html', title='Dashboard')
`
  );

  await writeFileIfMissing(
    path.join(routesDir, 'health.py'),
    `from flask import Blueprint, jsonify

health_bp = Blueprint('health', __name__)

@health_bp.route('/health')
def health_check():
    return jsonify({'status': 'healthy', 'message': 'API is running'})
`
  );

  // === SERVICES ===
  const servicesDir = path.join(appDir, 'services');
  await fs.mkdir(servicesDir, { recursive: true });

  await writeFileIfMissing(
    path.join(servicesDir, '__init__.py'),
    `from .user_service import UserService

__all__ = ['UserService']
`
  );

  await writeFileIfMissing(
    path.join(servicesDir, 'user_service.py'),
    `from app.models import User
from app.extensions import db

class UserService:
    @staticmethod
    def create_user(username: str, email: str) -> User:
        user = User(username=username, email=email)
        db.session.add(user)
        db.session.commit()
        return user

    @staticmethod
    def get_user_by_id(user_id: int) -> User:
        return User.query.get(user_id)

    @staticmethod
    def get_all_users():
        return User.query.all()
`
  );

  // === TEMPLATES ===
  const templatesDir = path.join(appDir, 'templates');
  await fs.mkdir(templatesDir, { recursive: true });
  await fs.mkdir(path.join(templatesDir, 'layouts'), { recursive: true });
  await fs.mkdir(path.join(templatesDir, 'pages'), { recursive: true });
  await fs.mkdir(path.join(templatesDir, 'components'), { recursive: true });

  // base.html
  await writeFileIfMissing(
    path.join(templatesDir, 'base.html'),
    `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{% block title %}Flask App{% endblock %}</title>
    <link rel="stylesheet" href="{{ url_for('static', filename='css/main.css') }}">
    {% block extra_css %}{% endblock %}
</head>
<body>
    {% include 'components/navbar.html' %}
    
    <main class="container">
        {% include 'components/alerts.html' %}
        {% block content %}{% endblock %}
    </main>
    
    {% include 'components/footer.html' %}
    
    <script src="{{ url_for('static', filename='js/main.js') }}"></script>
    {% block extra_js %}{% endblock %}
</body>
</html>
`
  );

  // layouts/main.html
  await writeFileIfMissing(
    path.join(templatesDir, 'layouts', 'main.html'),
    `{% extends 'base.html' %}

{% block content %}
<div class="main-layout">
    {% block page_content %}{% endblock %}
</div>
{% endblock %}
`
  );

  // pages/home.html
  await writeFileIfMissing(
    path.join(templatesDir, 'pages', 'home.html'),
    `{% extends 'layouts/main.html' %}

{% block title %}{{ title }} - Flask App{% endblock %}

{% block page_content %}
<section class="hero">
    <h1>Welcome to Flask App</h1>
    <p>A modern Python web application built with best practices.</p>
    <div class="hero-actions">
        <a href="/dashboard" class="btn btn-primary">Go to Dashboard</a>
        <a href="/login" class="btn btn-secondary">Login</a>
    </div>
</section>

<section class="features">
    <div class="feature-card">
        <h3>🚀 Fast</h3>
        <p>Optimized for performance</p>
    </div>
    <div class="feature-card">
        <h3>🔒 Secure</h3>
        <p>Built with security in mind</p>
    </div>
    <div class="feature-card">
        <h3>📱 Responsive</h3>
        <p>Works on all devices</p>
    </div>
</section>
{% endblock %}
`
  );

  // pages/login.html
  await writeFileIfMissing(
    path.join(templatesDir, 'pages', 'login.html'),
    `{% extends 'layouts/main.html' %}

{% block title %}{{ title }} - Flask App{% endblock %}

{% block extra_css %}
<link rel="stylesheet" href="{{ url_for('static', filename='css/auth.css') }}">
{% endblock %}

{% block page_content %}
<div class="auth-container">
    <div class="auth-card">
        <h2>Login</h2>
        <form id="login-form" class="auth-form">
            <div class="form-group">
                <label for="email">Email</label>
                <input type="email" id="email" name="email" required>
            </div>
            <div class="form-group">
                <label for="password">Password</label>
                <input type="password" id="password" name="password" required>
            </div>
            <button type="submit" class="btn btn-primary btn-full">Login</button>
        </form>
        <p class="auth-link">Don't have an account? <a href="#">Sign up</a></p>
    </div>
</div>
{% endblock %}

{% block extra_js %}
<script src="{{ url_for('static', filename='js/auth.js') }}"></script>
{% endblock %}
`
  );

  // pages/dashboard.html
  await writeFileIfMissing(
    path.join(templatesDir, 'pages', 'dashboard.html'),
    `{% extends 'layouts/main.html' %}

{% block title %}{{ title }} - Flask App{% endblock %}

{% block extra_css %}
<link rel="stylesheet" href="{{ url_for('static', filename='css/dashboard.css') }}">
{% endblock %}

{% block page_content %}
<div class="dashboard">
    <aside class="sidebar">
        <nav class="sidebar-nav">
            <a href="#" class="sidebar-link active">Overview</a>
            <a href="#" class="sidebar-link">Analytics</a>
            <a href="#" class="sidebar-link">Settings</a>
        </nav>
    </aside>
    <div class="dashboard-content">
        <h1>Dashboard</h1>
        <div class="dashboard-grid">
            <div class="stat-card">
                <h3>Total Users</h3>
                <p class="stat-number">1,234</p>
            </div>
            <div class="stat-card">
                <h3>Active Sessions</h3>
                <p class="stat-number">56</p>
            </div>
            <div class="stat-card">
                <h3>Revenue</h3>
                <p class="stat-number">$12,345</p>
            </div>
        </div>
    </div>
</div>
{% endblock %}
`
  );

  // pages/403.html
  await writeFileIfMissing(
    path.join(templatesDir, 'pages', '403.html'),
    `{% extends 'layouts/main.html' %}
{% block title %}403 Forbidden{% endblock %}
{% block page_content %}
<div style="text-align: center; padding: 4rem 1rem;">
    <h1>403</h1>
    <h2>Forbidden</h2>
    <p>You don't have permission to access this resource.</p>
    <br>
    <a href="/" class="btn btn-primary">Return Home</a>
</div>
{% endblock %}
`
  );

  // pages/404.html
  await writeFileIfMissing(
    path.join(templatesDir, 'pages', '404.html'),
    `{% extends 'layouts/main.html' %}
{% block title %}404 Not Found{% endblock %}
{% block page_content %}
<div style="text-align: center; padding: 4rem 1rem;">
    <h1>404</h1>
    <h2>Page Not Found</h2>
    <p>The page you are looking for might have been removed or is temporarily unavailable.</p>
    <br>
    <a href="/" class="btn btn-primary">Return Home</a>
</div>
{% endblock %}
`
  );

  // pages/500.html
  await writeFileIfMissing(
    path.join(templatesDir, 'pages', '500.html'),
    `{% extends 'layouts/main.html' %}
{% block title %}500 Internal Server Error{% endblock %}
{% block page_content %}
<div style="text-align: center; padding: 4rem 1rem;">
    <h1>500</h1>
    <h2>Internal Server Error</h2>
    <p>Something went wrong on our end. We're working on fixing it.</p>
    <br>
    <a href="/" class="btn btn-primary">Return Home</a>
</div>
{% endblock %}
`
  );

  // components/navbar.html
  await writeFileIfMissing(
    path.join(templatesDir, 'components', 'navbar.html'),
    `<nav class="navbar">
    <div class="container navbar-container">
        <a href="/" class="navbar-brand">Flask App</a>
        <ul class="navbar-nav">
            <li><a href="/">Home</a></li>
            <li><a href="/dashboard">Dashboard</a></li>
            <li><a href="/login" class="btn btn-outline">Login</a></li>
        </ul>
    </div>
</nav>
`
  );

  // components/footer.html
  await writeFileIfMissing(
    path.join(templatesDir, 'components', 'footer.html'),
    `<footer class="footer">
    <div class="container">
        <p>&copy; 2024 Flask App. All rights reserved.</p>
    </div>
</footer>
`
  );

  // components/alerts.html
  await writeFileIfMissing(
    path.join(templatesDir, 'components', 'alerts.html'),
    `{% with messages = get_flashed_messages(with_categories=true) %}
    {% if messages %}
        {% for category, message in messages %}
        <div class="alert alert-{{ category }}">
            {{ message }}
            <button class="alert-close" onclick="this.parentElement.remove()">&times;</button>
        </div>
        {% endfor %}
    {% endif %}
{% endwith %}
`
  );

  // === STATIC FILES ===
  const staticDir = path.join(appDir, 'static');
  await fs.mkdir(path.join(staticDir, 'css'), { recursive: true });
  await fs.mkdir(path.join(staticDir, 'js'), { recursive: true });
  await fs.mkdir(path.join(staticDir, 'images', 'icons'), { recursive: true });
  await fs.mkdir(path.join(staticDir, 'fonts'), { recursive: true });

  // css/main.css
  await writeFileIfMissing(
    path.join(staticDir, 'css', 'main.css'),
    `:root {
    --primary: #3b82f6;
    --primary-dark: #2563eb;
    --secondary: #64748b;
    --success: #22c55e;
    --danger: #ef4444;
    --warning: #f59e0b;
    --dark: #1e293b;
    --light: #f8fafc;
    --border: #e2e8f0;
}

* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    line-height: 1.6;
    color: var(--dark);
    background: var(--light);
}

.container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 1rem;
}

/* Navbar */
.navbar {
    background: white;
    border-bottom: 1px solid var(--border);
    padding: 1rem 0;
}

.navbar-container {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.navbar-brand {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--primary);
    text-decoration: none;
}

.navbar-nav {
    display: flex;
    list-style: none;
    gap: 1.5rem;
    align-items: center;
}

.navbar-nav a {
    color: var(--secondary);
    text-decoration: none;
    transition: color 0.2s;
}

.navbar-nav a:hover {
    color: var(--primary);
}

/* Buttons */
.btn {
    display: inline-block;
    padding: 0.75rem 1.5rem;
    border-radius: 0.5rem;
    font-weight: 500;
    text-decoration: none;
    cursor: pointer;
    border: none;
    transition: all 0.2s;
}

.btn-primary {
    background: var(--primary);
    color: white;
}

.btn-primary:hover {
    background: var(--primary-dark);
}

.btn-secondary {
    background: var(--secondary);
    color: white;
}

.btn-outline {
    background: transparent;
    border: 2px solid var(--primary);
    color: var(--primary);
}

.btn-outline:hover {
    background: var(--primary);
    color: white;
}

.btn-full {
    width: 100%;
}

/* Hero */
.hero {
    text-align: center;
    padding: 6rem 1rem;
    background: linear-gradient(135deg, var(--primary), var(--primary-dark));
    color: white;
}

.hero h1 {
    font-size: 3rem;
    margin-bottom: 1rem;
}

.hero p {
    font-size: 1.25rem;
    opacity: 0.9;
    margin-bottom: 2rem;
}

.hero-actions {
    display: flex;
    gap: 1rem;
    justify-content: center;
}

/* Features */
.features {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 2rem;
    padding: 4rem 1rem;
}

.feature-card {
    background: white;
    padding: 2rem;
    border-radius: 1rem;
    text-align: center;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
}

.feature-card h3 {
    margin-bottom: 0.5rem;
}

/* Alerts */
.alert {
    padding: 1rem;
    border-radius: 0.5rem;
    margin-bottom: 1rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.alert-success {
    background: #dcfce7;
    color: #166534;
}

.alert-danger {
    background: #fee2e2;
    color: #991b1b;
}

.alert-warning {
    background: #fef3c7;
    color: #92400e;
}

.alert-close {
    background: none;
    border: none;
    font-size: 1.25rem;
    cursor: pointer;
    opacity: 0.5;
}

/* Footer */
.footer {
    background: var(--dark);
    color: white;
    text-align: center;
    padding: 2rem;
    margin-top: 4rem;
}
`
  );

  // css/auth.css
  await writeFileIfMissing(
    path.join(staticDir, 'css', 'auth.css'),
    `.auth-container {
    min-height: 80vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
}

.auth-card {
    background: white;
    padding: 2.5rem;
    border-radius: 1rem;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1);
    width: 100%;
    max-width: 400px;
}

.auth-card h2 {
    text-align: center;
    margin-bottom: 2rem;
}

.auth-form .form-group {
    margin-bottom: 1.5rem;
}

.auth-form label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 500;
}

.auth-form input {
    width: 100%;
    padding: 0.75rem 1rem;
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    font-size: 1rem;
}

.auth-form input:focus {
    outline: none;
    border-color: var(--primary);
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.auth-link {
    text-align: center;
    margin-top: 1.5rem;
    color: var(--secondary);
}

.auth-link a {
    color: var(--primary);
}
`
  );

  // css/dashboard.css
  await writeFileIfMissing(
    path.join(staticDir, 'css', 'dashboard.css'),
    `.dashboard {
    display: grid;
    grid-template-columns: 250px 1fr;
    min-height: calc(100vh - 200px);
}

.sidebar {
    background: white;
    border-right: 1px solid var(--border);
    padding: 2rem;
}

.sidebar-nav {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}

.sidebar-link {
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    color: var(--secondary);
    text-decoration: none;
    transition: all 0.2s;
}

.sidebar-link:hover,
.sidebar-link.active {
    background: var(--primary);
    color: white;
}

.dashboard-content {
    padding: 2rem;
}

.dashboard-content h1 {
    margin-bottom: 2rem;
}

.dashboard-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1.5rem;
}

.stat-card {
    background: white;
    padding: 1.5rem;
    border-radius: 1rem;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
}

.stat-card h3 {
    color: var(--secondary);
    font-size: 0.875rem;
    margin-bottom: 0.5rem;
}

.stat-number {
    font-size: 2rem;
    font-weight: 700;
    color: var(--primary);
}

@media (max-width: 768px) {
    .dashboard {
        grid-template-columns: 1fr;
    }
    
    .sidebar {
        border-right: none;
        border-bottom: 1px solid var(--border);
    }
    
    .sidebar-nav {
        flex-direction: row;
        overflow-x: auto;
    }
}
`
  );

  // js/main.js
  await writeFileIfMissing(
    path.join(staticDir, 'js', 'main.js'),
    `// Main JavaScript file
console.log('Flask App loaded');

document.addEventListener('DOMContentLoaded', function() {
    // Auto-dismiss alerts after 5 seconds
    const alerts = document.querySelectorAll('.alert');
    alerts.forEach(alert => {
        setTimeout(() => {
            alert.style.opacity = '0';
            setTimeout(() => alert.remove(), 300);
        }, 5000);
    });
});
`
  );

  // js/auth.js
  await writeFileIfMissing(
    path.join(staticDir, 'js', 'auth.js'),
    `// Authentication JavaScript
document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('login-form');
    
    if (loginForm) {
        loginForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            
            // TODO: Implement actual login logic
            console.log('Login attempt:', { email });
            
            // Example API call (implement your actual endpoint)
            // const response = await fetch('/api/login', { ... });
        });
    }
});
`
  );

  // js/api.js
  await writeFileIfMissing(
    path.join(staticDir, 'js', 'api.js'),
    `// API utility functions
const API = {
    baseUrl: '/api',

    async get(endpoint) {
        const response = await fetch(\`\${this.baseUrl}\${endpoint}\`);
        return response.json();
    },

    async post(endpoint, data) {
        const response = await fetch(\`\${this.baseUrl}\${endpoint}\`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });
        return response.json();
    },

    async healthCheck() {
        return this.get('/health');
    }
};
`
  );

  // === ROOT FILES ===
  
  // wsgi.py - Development entry point (for backwards compatibility)
  await writeFileIfMissing(
    path.join(projectPath, 'wsgi.py'),
    `# Flask App
import os
import sys

# Try to capture all errors during startup, including imports
try:
    from app import create_app
    app = create_app(os.getenv('FLASK_CONFIG') or 'default')

    if __name__ == '__main__':
        # PORT is set by the preview manager to the dynamically assigned preview port
        port = int(os.environ.get('PORT', 3000))
        # Bind specifically to 0.0.0.0 for consistent behavior on Windows
        # Disable reloader to prevent forking issues
        app.run(host='0.0.0.0', port=port, debug=True, use_reloader=False)

except Exception as e:
    import traceback
    print(f"CRITICAL: Failed to start Flask app: {e}", file=sys.stderr)
    traceback.print_exc()
    sys.exit(1)

`
  );


  // requirements.txt
  await writeFileIfMissing(
    path.join(projectPath, 'requirements.txt'),
    `flask>=3.0.0
flask-sqlalchemy>=3.1.0
flask-migrate>=4.0.0
python-dotenv>=1.0.0
gunicorn>=21.0.0; sys_platform != 'win32'
pytest>=7.0.0
`
  );

  // .env
  await writeFileIfMissing(
    path.join(projectPath, '.env'),
    `FLASK_APP=wsgi.py
FLASK_DEBUG=true
FLASK_CONFIG=development
SECRET_KEY=dev-secret-key-change-in-production
DATABASE_URL=sqlite:///instance/app.db
`
  );

  // .gitignore
  await writeFileIfMissing(
    path.join(projectPath, '.gitignore'),
    `# Python
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
venv/
env/
.venv/

# Flask
instance/
*.db

# Environment
.env
.env.local

# IDE
.idea/
.vscode/
*.swp
*.swo
.claudable/

# OS
.DS_Store
Thumbs.db

# Testing
.coverage
htmlcov/
.pytest_cache/

# Build
dist/
build/
*.egg-info/
`
  );

  // Dockerfile
  await writeFileIfMissing(
    path.join(projectPath, 'Dockerfile'),
    `FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

# Expose port
EXPOSE 8000

# Run with gunicorn
CMD ["gunicorn", "--bind", "0.0.0.0:3000", "wsgi:app"]
`
  );

  // docker-compose.yml
  await writeFileIfMissing(
    path.join(projectPath, 'docker-compose.yml'),
    `version: '3.8'

services:
  web:
    build: .
    ports:
      - "8000:8000"
    environment:
      - FLASK_APP=wsgi.py
      - FLASK_DEBUG=false
      - SECRET_KEY=\${SECRET_KEY:-production-secret-key}
      - DATABASE_URL=\${DATABASE_URL:-sqlite:///instance/app.db}
    volumes:
      - ./instance:/app/instance
    restart: unless-stopped
`
  );

  // === TESTS ===
  const testsDir = path.join(projectPath, 'tests');
  await fs.mkdir(testsDir, { recursive: true });

  await writeFileIfMissing(
    path.join(testsDir, '__init__.py'),
    ``
  );

  await writeFileIfMissing(
    path.join(testsDir, 'conftest.py'),
    `import pytest
from app import create_app

@pytest.fixture
def app():
    app = create_app('testing')
    yield app

@pytest.fixture
def client(app):
    return app.test_client()
`
  );

  await writeFileIfMissing(
    path.join(testsDir, 'test_health.py'),
    `def test_health_check(client):
    response = client.get('/api/health')
    assert response.status_code == 200
    data = response.get_json()
    assert data['status'] == 'healthy'

def test_home_page(client):
    response = client.get('/')
    assert response.status_code == 200
`
  );

  // === MIGRATIONS (placeholder) ===
  const migrationsDir = path.join(projectPath, 'migrations');
  await fs.mkdir(migrationsDir, { recursive: true });

  await writeFileIfMissing(
    path.join(migrationsDir, 'README'),
    `Database Migrations

This directory contains Flask-Migrate/Alembic migration scripts.

To initialize migrations:
    flask db init

To create a new migration:
    flask db migrate -m "description"

To apply migrations:
    flask db upgrade

To rollback:
    flask db downgrade
`
  );

  // === DATABASE & UPLOADS FOLDERS ===
  const instanceDir = path.join(projectPath, 'instance');
  await fs.mkdir(instanceDir, { recursive: true });
  await writeFileIfMissing(
    path.join(instanceDir, '.gitignore'),
    `*
!.gitignore
`
  );

  const uploadsDir = path.join(projectPath, 'uploads');
  await fs.mkdir(uploadsDir, { recursive: true });
  await writeFileIfMissing(
    path.join(uploadsDir, 'README.md'),
    `# User Uploads
This directory stores files uploaded by users.
`
  );
}

export async function scaffoldFastApp(
  projectPath: string,
  projectId: string
) {
  await fs.mkdir(projectPath, { recursive: true });

  // === APP DIRECTORY ===
  const appDir = path.join(projectPath, 'app');
  await fs.mkdir(appDir, { recursive: true });
  await fs.mkdir(path.join(appDir, 'core'), { recursive: true });
  await fs.mkdir(path.join(appDir, 'routes'), { recursive: true });
  await fs.mkdir(path.join(appDir, 'templates'), { recursive: true });
  await fs.mkdir(path.join(appDir, 'static'), { recursive: true });

  // app/main.py
  await writeFileIfMissing(
    path.join(appDir, 'main.py'),
    `from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import get_settings
from app.core.database import init_db
from app.routes import main as main_routes

import os

settings = get_settings()

app = FastAPI(title=settings.PROJECT_NAME, openapi_url=f"{settings.API_V1_STR}/openapi.json")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API Routes
app.include_router(main_routes.router, prefix=settings.API_V1_STR)

# Static Files
# Serve 'public' directory as /static
public_dir = os.path.join(os.path.dirname(__file__), '..', 'public')
if not os.path.exists(public_dir):
    os.makedirs(public_dir)

app.mount("/static", StaticFiles(directory=public_dir), name="static")

# Templates
templates_dir = os.path.join(os.path.dirname(__file__), 'templates')
templates = Jinja2Templates(directory=templates_dir)

# Page Routes
@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    return templates.TemplateResponse("index.html", {"request": request, "title": "Home"})

@app.on_event("startup")
def on_startup():
    init_db()
`
  );

  // app/auth.py
  await writeFileIfMissing(
    path.join(appDir, 'auth.py'),
    `from datetime import datetime, timedelta
from typing import Optional, Union, Any
from jose import jwt, JWTError
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlmodel import Session, select
from app.core.config import get_settings
from app.core.database import get_session
# from app.models import User  # Uncomment when User model is ready

settings = get_settings()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/login")

def create_access_token(subject: Union[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode = {"exp": expire, "sub": str(subject)}
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

# Placeholder for user verification
# def get_current_user(token: str = Depends(oauth2_scheme), session: Session = Depends(get_session)) -> User:
#     ...
`
  );

  // app/models.py
  await writeFileIfMissing(
    path.join(appDir, 'models.py'),
    `from typing import Optional
from datetime import datetime
from sqlmodel import Field, SQLModel
# from passlib.context import CryptContext

# pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

class User(SQLModel, table=True):
    __tablename__ = "users"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(unique=True, index=True)
    email: str = Field(unique=True, index=True)
    password_hash: Optional[str] = None
    is_admin: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    # def set_password(self, password: str):
    #     self.password_hash = pwd_context.hash(password)

    # def check_password(self, password: str) -> bool:
    #     if not self.password_hash:
    #         return False
    #     return pwd_context.verify(password, self.password_hash)
`
  );

  // app/core/config.py
  await writeFileIfMissing(
    path.join(appDir, 'core/config.py'),
    `import os
from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import Optional

class Settings(BaseSettings):
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "${projectId}"
    
    # Security
    SECRET_KEY: str = os.environ.get("SECRET_KEY", "your-super-secret-key-change-me")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    # Database
    DATABASE_URL: Optional[str] = os.environ.get("DATABASE_URL")

    class Config:
        case_sensitive = True

    @property
    def assemble_db_connection(self) -> str:
        if self.DATABASE_URL:
            return self.DATABASE_URL
        
        # Local Development Fallback -> SQLite
        import pathlib
        base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
        instance_path = os.path.join(base_dir, 'instance')
        os.makedirs(instance_path, exist_ok=True)
        db_path = os.path.join(instance_path, 'app.db')
        
        if os.name == 'nt':
             return 'sqlite:///' + str(db_path).replace('\\\\', '/')
        else:
             return 'sqlite:///' + str(db_path)

@lru_cache()
def get_settings():
    return Settings()
`
  );

  // app/core/database.py
  await writeFileIfMissing(
    path.join(appDir, 'core/database.py'),
    `from sqlmodel import SQLModel, create_engine, Session
from .config import get_settings

settings = get_settings()

connect_args = {"check_same_thread": False} if "sqlite" in settings.assemble_db_connection else {}

engine = create_engine(
    settings.assemble_db_connection, 
    echo=False, 
    connect_args=connect_args
)

def get_session():
    with Session(engine) as session:
        yield session

def init_db():
    SQLModel.metadata.create_all(engine)
`
  );

  // app/routes/main.py
  await writeFileIfMissing(
    path.join(appDir, 'routes/main.py'),
    `from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session
from app.core.database import get_session
# from app.models import User
from app.core.config import get_settings

router = APIRouter()
settings = get_settings()

@router.get("/health")
def health_check():
    return {"status": "healthy", "project": settings.PROJECT_NAME}
`
  );

  // app/routes/__init__.py
  await writeFileIfMissing(
    path.join(appDir, 'routes/__init__.py'),
    ``
  );
  
  // ROOT Files
  
  // requirements.txt
  await writeFileIfMissing(
    path.join(projectPath, 'requirements.txt'),
    `fastapi>=0.128.0
uvicorn[standard]>=0.27.0
sqlmodel>=0.0.14
python-jose[cryptography]>=3.3.0
passlib[bcrypt]>=1.7.4
python-multipart
jinja2>=3.1.2
pydantic-settings>=2.0.0
`
  );

  // package.json (scripts)
  await writeFileIfMissing(
    path.join(projectPath, 'package.json'),
    JSON.stringify({
      name: projectId,
      version: "1.0.0",
      description: "FastAPI Project",
      scripts: {
        dev: "uvicorn app.main:app --reload",
        start: "uvicorn app.main:app --host 0.0.0.0 --port 8000"
      },
      keywords: [],
      author: "",
      license: "ISC"
    }, null, 2) + "\n"
  );
  
  // Dockerfile
  await writeFileIfMissing(
    path.join(projectPath, 'Dockerfile'),
    `FROM python:3.11-slim

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Expose port
EXPOSE 8000

# Start Uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
`
  );

  // docker-compose.yml
  await writeFileIfMissing(
    path.join(projectPath, 'docker-compose.yml'),
    `
services:
  backend:
    container_name: ${projectId}_backend
    build: .
    ports:
      - "8000:8000"
    env_file:
      - .env
    environment:
      - DATABASE_URL=sqlite:////app/instance/app.db
    volumes:
      - ./instance:/app/instance
      - ./public:/app/public
    restart: unless-stopped

  caddy:
    container_name: ${projectId}_caddy
    image: caddy:2-alpine
    ports:
      - "80:80"
      - "443:443"
    environment:
      - DOMAIN_NAME=\${DOMAIN_NAME:-localhost}
      - DOMAIN_EMAIL=\${DOMAIN_EMAIL:-admin@example.com}
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - backend
    restart: unless-stopped

volumes:
  caddy_data:
  caddy_config:
`
  );

  // Caddyfile
  await writeFileIfMissing(
    path.join(projectPath, 'Caddyfile'),
    `{
    # Global options
    email {$DOMAIN_EMAIL:admin@example.com}
}

{$DOMAIN_NAME:localhost} {
    # Reverse proxy to the backend service
    reverse_proxy backend:8000

    # Compress responses
    encode zstd gzip

    log {
        output file /data/access.log {
            roll_size 50MB
            roll_keep 10
            roll_keep_for 720h
        }
    }
}
`
  );

  // .env
  await writeFileIfMissing(
    path.join(projectPath, '.env'),
    `SECRET_KEY=change-me
DATABASE_URL=
DOMAIN_NAME=localhost
DOMAIN_EMAIL=admin@localhost
`
  );
  
  // .gitignore
  await writeFileIfMissing(
    path.join(projectPath, '.gitignore'),
    `__pycache__/
*.py[cod]
*$py.class
instance/
.env
.idea/
.vscode/
`
  );
  
  // public/
  const publicDir = path.join(projectPath, 'public');
  await fs.mkdir(publicDir, { recursive: true });
  
  // templates/base.html
  await writeFileIfMissing(
    path.join(appDir, 'templates/base.html'),
    `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{% block title %}FastAPI App{% endblock %}</title>
</head>
<body>
    <header>
        <nav>
            <a href="/">Home</a>
        </nav>
    </header>
    <main>
        {% block content %}{% endblock %}
    </main>
</body>
</html>
`
  );
  
  // templates/index.html
  await writeFileIfMissing(
    path.join(appDir, 'templates/index.html'),
    `{% extends "base.html" %}

{% block title %}{{ title }}{% endblock %}

{% block content %}
<h1>Welcome to FastAPI</h1>
<p>This is a scaffolded project.</p>
{% endblock %}
`
  );
}



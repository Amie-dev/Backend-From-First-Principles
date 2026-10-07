# Implementation Guide - Chapter 01: Project Setup & Package Configuration

## 1. Overview & Goal

In this chapter, we initialize the Node.js project, configure ES Modules (`"type": "module"`), install required dependencies (`express`, `jsonwebtoken`), and define execution scripts.

---

## 2. Terminal Setup Commands

Run the following commands in your terminal:

```bash
# Create directory structure
mkdir -p day01/code/src/{errors,middlewares,controllers}
cd day01/code

# Initialize package.json
npm init -y

# Install production dependencies
npm install express jsonwebtoken
```

---

## 3. Complete Source Code: `package.json`

Create the file `day01/code/package.json` with the following content:

```json
{
  "name": "day01-express-backend-from-first-principles",
  "version": "1.0.0",
  "description": "Day 01 - Express.js backend implementation of core HTTP principles (ES Modules)",
  "main": "src/server.js",
  "type": "module",
  "scripts": {
    "start": "node src/server.js",
    "raw-server": "node src/raw-http-server.js",
    "dev": "node --watch src/server.js"
  },
  "keywords": [
    "http",
    "express",
    "backend",
    "statelessness",
    "cors",
    "caching",
    "etag",
    "sse",
    "streaming",
    "esm"
  ],
  "dependencies": {
    "express": "^4.19.2",
    "jsonwebtoken": "^9.0.2"
  }
}
```

---

## 4. Line-by-Line Code Explanation

* `"type": "module"`: **Critical line**. Instructs Node.js to treat all `.js` files as native **ES Modules**. This allows us to use modern `import` and `export` statements instead of legacy CommonJS `require()`.
* `"main": "src/server.js"`: Specifies the primary entry point script of the backend application.
* `"scripts"`:
  * `"start"`: Runs the main Express server using `node src/server.js`.
  * `"raw-server"`: Runs the first-principles raw TCP socket HTTP server using `node src/raw-http-server.js`.
  * `"dev"`: Runs the server using Node 18+ native file watcher (`node --watch src/server.js`), automatically restarting on file saves.
* `"dependencies"`:
  * `express`: Fast, minimalist web framework providing HTTP request/response routing and middleware composition.
  * `jsonwebtoken`: Industry-standard library to generate and verify cryptographically signed stateless authentication tokens.

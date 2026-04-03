const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Sales Dash Mobile API",
      version: "1.0.0",
      description:
        "API documentation for the Polygon Agro Hub Sales Dash Mobile app.",
    },
    servers: [
      {
        url: "http://localhost:3000/agro-api/salesdash",
        description: "Local Server",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ["./routes/*.js", "./server.js"],
};

const swaggerSpec = swaggerJsdoc(options);

const setupSwagger = (app, basePath) => {
  const swaggerPath = `${basePath}/api-docs`;

  // Fix trailing slash issue
  app.use(swaggerPath, (req, res, next) => {
    if (req.originalUrl === swaggerPath) {
      return res.redirect(`${swaggerPath}/`);
    }
    next();
  });

  // prevents JS loading error on Vercel
  app.use(
    swaggerPath,
    swaggerUi.serveFiles(swaggerSpec),
    swaggerUi.setup(swaggerSpec, {
      explorer: true,
      customCssUrl:
        "https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.3.0/swagger-ui.min.css",
      customJs: [
        "https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.3.0/swagger-ui-bundle.js",
        "https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.3.0/swagger-ui-standalone-preset.js",
      ],
    })
  );
};

module.exports = setupSwagger;
# ---------------------------- External Imports ----------------------------
# Load environment variables from a .env file
from dotenv import load_dotenv

# Handle file system paths in an OS-independent way
from pathlib import Path

# Import FastAPI framework and Request object for middleware/exception handling
from fastapi import FastAPI, Request

# Import CORS middleware to handle cross-origin requests
from fastapi.middleware.cors import CORSMiddleware

# Import JSONResponse to send structured error responses
from fastapi.responses import JSONResponse

# ---------------------------- Environment Setup ----------------------------
# Determine the base directory by going 3 levels up from the current file
BASE_DIR = Path(__file__).resolve().parent.parent.parent

# Load environment variables from the .env file located at BASE_DIR
_ = load_dotenv(dotenv_path=BASE_DIR / ".env")

# ---------------------------- Internal Imports ----------------------------
# Import authentication router
from .api.auth_routes.auth_routes import router as auth_router

# Import refresh token router for JWT/session management
from .api.auth_routes.refresh_token_routes import router as refresh_token_router

# Import user router for profile and admin user management
from .api.user_routes.user_routes import router as user_router

# Custom middleware to log every API request
from .logging.logging_middleware import LoggingMiddleware

# JSON-formatted rotating logger
from .logging.logging_config import get_logger

# ---------------------------- Logging Setup ----------------------------
# Create or reuse logger instance
logger = get_logger("main")

# ---------------------------- App Initialization ----------------------------
# Create a FastAPI application instance
app = FastAPI()

# ---------------------------- Trace Source Middleware ----------------------------
# Middleware to log which frontend function calls /auth/me
@app.middleware("http")
async def log_auth_source(request: Request, call_next):
    if request.url.path == "/auth/me":
        src = request.query_params.get("src", "unknown")
        logger.info(f"/auth/me called from: {src}")
    response = await call_next(request)
    return response

# ---------------------------- Middleware Configuration ----------------------------
# Add CORS middleware to allow requests from the frontend at port 5173
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Frontend URL
    allow_credentials=True,                   # Allow cookies and auth headers
    allow_methods=["*"],                       # Allow all HTTP methods
    allow_headers=["*"],                       # Allow all headers
)

# Add custom logging middleware to log all incoming requests/responses
app.add_middleware(LoggingMiddleware)

# ---------------------------- Global Exception Handler ----------------------------
# Define a global exception handler for catching unhandled exceptions
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    # Log the error with request path and message
    logger.exception(f"Unhandled Exception at {request.url.path}: {str(exc)}")

    # Return a 500 Internal Server Error response
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal Server Error"},
    )

# ---------------------------- Router Registration ----------------------------
# Register authentication router
app.include_router(auth_router)

# Register refresh token router
app.include_router(refresh_token_router)

# Register user router for profile and admin user management
app.include_router(user_router)

# ---------------------------- Root Route ----------------------------
# Define a simple root endpoint to confirm the API is running
@app.get("/")
def read_root():
    return {"message": "Welcome to the Full Stack Template!"}
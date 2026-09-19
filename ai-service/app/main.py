import os
from flask import Flask, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

from app.routes.generate import generate_bp

load_dotenv()


def create_app():
    app = Flask(__name__)
    CORS(app)

    app.register_blueprint(generate_bp, url_prefix="/generate")

    @app.get("/health")
    def health():
        return jsonify(status="ok", service="steadypost-ai-service")

    @app.errorhandler(Exception)
    def handle_error(err):
        code = getattr(err, "code", 500)
        return jsonify(error=str(err)), code if isinstance(code, int) else 500

    return app


app = create_app()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", 5001)))

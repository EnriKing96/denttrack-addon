FROM python:3.11-alpine

WORKDIR /app

# Copia l'intera cartella dell'applicazione
COPY . /app

EXPOSE 8080

CMD ["python3", "server.py"]

.PHONY: up down build logs

# Sobe a aplicação construindo as imagens
up:
	docker compose up -d --build

# Desliga e remove os containers e redes criadas
down:
	docker compose down

# Força apenas o build, util para limpar cache se precisar
build:
	docker compose build

# Acompanhar os logs do servidor Nginx e do App simultaneamente em tempo real
logs:
	docker compose logs -f

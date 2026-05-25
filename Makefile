.PHONY: install dev build start lint typecheck check webhook docker-build docker-run docker-stop

install:
	npm install

dev:
	npm run dev

build:
	npm run build

start:
	npm run start

lint:
	npm run lint

typecheck:
	npm run typecheck

check:
	npm run check

docker-build:
	docker build -t whatsapp-bot .

docker-run:
	docker run --rm -p 3000:3000 --env-file .env whatsapp-bot

docker-stop:
	docker stop $$(docker ps -q --filter ancestor=whatsapp-bot) 2>/dev/null || true

# Simule un message entrant sur le webhook local
webhook:
	@curl -s -X POST http://localhost:3000/api/webhook \
	  -H "Content-Type: application/json" \
	  -d '{ \
	    "event": "messages.received", \
	    "timestamp": 1234567890, \
	    "data": { \
	      "messages": { \
	        "key": { \
	          "id": "TEST1", \
	          "fromMe": false, \
	          "remoteJid": "test@s.whatsapp.net", \
	          "cleanedSenderPn": "+221700000000" \
	        }, \
	        "messageBody": "Bonjour !" \
	      } \
	    } \
	  }' | cat

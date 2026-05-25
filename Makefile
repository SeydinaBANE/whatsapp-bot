.PHONY: install dev build start lint typecheck check webhook

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

.PHONY: dev test seed build install migrate clean

install:
	cd backend && npm install
	cd frontend && npm install

dev:
	cd backend && npm run dev

build:
	cd backend && npm run build
	cd frontend && npm run build

test:
	cd backend && npm test

seed:
	cd backend && npm run seed

migrate:
	cd backend && npm run migrate

clean:
	rm -rf backend/dist frontend/dist

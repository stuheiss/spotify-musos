all:
	@echo "make auth &"
	@echo "make client &"
auth: FRC
	(cd auth-server; node authorization_code/app.js)
client: FRC
	(cd client && npm start)
FRC:

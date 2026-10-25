class PinRequired extends Error {
	public constructor(message: string) {
		super(message);
		this.name = "PinRequired";
	}
}

export { PinRequired };

import bcrypt from 'bcryptjs';

const hash = '$2b$12$AqyGjZjgPr.FXw8hv/fgwONXPy2amcyBhNzmy9lMOGvjSVUxGpfVG';
const password = 'W00dtree!tg';
const match = await bcrypt.compare(password, hash);
console.log('Password match:', match);

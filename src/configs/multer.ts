/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/consistent-indexed-object-style */
import multer, { FileFilterCallback } from 'multer';
import path from 'path';
import fs from 'fs';
import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils';
import httpStatus from 'http-status';

const createDirectory = (dir: string) => {
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
};

const PUBLIC_DIR = path.resolve(
	__dirname,
	process.env.NODE_ENV === 'development' ? '../../public' : '../../../public',
);

// ==========================================
// Allowed types
// ==========================================

const ALLOWED_EXTENSIONS = [
	'jpeg',
	'jpg',
	'png',
	'webp',
	'gif',
	'mp4',
	'mov',
	'pdf',
	'mp3',
	'doc',
	'docx',
];

const MIME_TO_EXT: { [key: string]: string } = {
	'image/jpeg': 'jpg',
	'image/jpg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
	'image/gif': 'gif',
	'video/mp4': 'mp4',
	'video/mov': 'mov',
	'video/quicktime': 'mov',
	'application/pdf': 'pdf',
	'audio/mpeg': 'mp3',
	'application/msword': 'doc',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
		'docx',
};

// ==========================================
// Destination by field name
// ==========================================

const getDestination = (fileField: string): string => {
	switch (fileField) {
		case 'videos':
			return 'videos';
		case 'images':
			return 'images';
		case 'gifs':
			return 'gifs';
		case 'docs':
			return 'docs';
		case 'audios':
			return 'audios';
		default:
			throw new Error('Invalid field name');
	}
};

const getFileExtension = (file: Express.Multer.File): string => {
	if (MIME_TO_EXT[file.mimetype]) {
		return MIME_TO_EXT[file.mimetype];
	}

	// Fallback to original extension if it is an allowed one
	const originalExt = path
		.extname(file.originalname)
		.toLowerCase()
		.substring(1);

	return ALLOWED_EXTENSIONS.includes(originalExt) ? originalExt : 'txt';
};

// ==========================================
// Storage
// ==========================================

const storage = multer.diskStorage({
	destination: (req: Request, file, cb) => {
		try {
			const destFolder = getDestination(file.fieldname);
			const filePath = path.join(PUBLIC_DIR, 'uploads', destFolder);
			createDirectory(filePath);
			cb(null, filePath);
		} catch (error) {
			cb(error, '');
		}
	},
	filename: (
		req: Request,
		file: Express.Multer.File,
		cb: (error: Error | null, filename: string) => void,
	): void => {
		const ext = getFileExtension(file);
		const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
		cb(null, `${file.fieldname}-${unique}.${ext}`);
	},
});

// ==========================================
// File type check
// ==========================================

const checkFileType = (
	file: Express.Multer.File,
	cb: FileFilterCallback,
): void => {
	const fileExtension = path
		.extname(file.originalname)
		.toLowerCase()
		.substring(1);

	const isValidExtension = ALLOWED_EXTENSIONS.includes(fileExtension);

	const isValidMimeType =
		file.mimetype.startsWith('image/') ||
		file.mimetype.startsWith('video/') ||
		file.mimetype.startsWith('application/pdf') ||
		file.mimetype.startsWith('audio/') ||
		file.mimetype === 'application/msword' ||
		file.mimetype ===
			'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

	if (isValidExtension && isValidMimeType) {
		cb(null, true);
	} else {
		cb(
			new Error(
				'Error: Images (.jpeg, .jpg, .png, .webp, .gif), videos (.mp4, .mov), Audio (.mp3), and File (.pdf, .doc, .docx) only allow!',
			),
		);
	}
};

// ==========================================
// Multer init
// ==========================================

const upload = multer({
	storage,
	limits: {
		// Text fields (blog content with base64 editor images can be large)
		fieldSize: 25 * 1024 * 1024,
	},
	fileFilter: (
		req: Request,
		file: Express.Multer.File,
		cb: FileFilterCallback,
	): void => {
		checkFileType(file, cb);
	},
}).fields([
	{ name: 'gifs', maxCount: 10 },
	{ name: 'images', maxCount: 10 },
	{ name: 'videos', maxCount: 10 },
	{ name: 'docs', maxCount: 10 },
	{ name: 'audios', maxCount: 10 },
]);

// ==========================================
// Middleware
// ==========================================

const uploadMiddleware = (req: Request, res: Response, next: NextFunction) => {
	upload(req, res, (err: any) => {
		if (err instanceof multer.MulterError) {
			if (err.code === 'LIMIT_UNEXPECTED_FILE') {
				// Unknown file field names are ignored (existing behaviour).
				// Frontend must send files as: images / videos / gifs / docs / audios
				return next();
			}
			return next(new ApiError(httpStatus.BAD_REQUEST, err.message));
		} else if (err) {
			return next(new ApiError(httpStatus.BAD_REQUEST, err.message));
		}
		next();
	});
};

export default uploadMiddleware;
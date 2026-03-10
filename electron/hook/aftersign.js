const { notarize } = require('@electron/notarize');

require('dotenv').config();

exports.default = async function notarizing(context) {
	if (process.platform === 'win32' || process.env.ELECTRON_SKIP_NOTARIZE) {
		return;
	};

	const { electronPlatformName, appOutDir } = context;

	if (electronPlatformName == 'darwin') {
		const appName = context.packager.appInfo.productFilename;

		return await notarize({
			tool: 'notarytool',
			appPath: `${appOutDir}/${appName}.app`,
			appleId: process.env.APPLEID,
			appleIdPassword: process.env.APPLEIDPASS,
			teamId: process.env.APPLETEAM,
		});
	};

	return null;
};

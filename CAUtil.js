/*
 * Copyright IBM Corp. All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';
const forge = require('node-forge');
const adminUserId = 'admin';
const adminUserPasswd = 'adminpw';

/**
 *
 * @param {*} FabricCAServices
 * @param {*} ccp
 */
exports.buildCAClient = (FabricCAServices, ccp, caHostName) => {
	// Create a new CA client for interacting with the CA.
	const caInfo = ccp.certificateAuthorities[caHostName]; //lookup CA details from config
	const caTLSCACerts = caInfo.tlsCACerts.pem;
	const caClient = new FabricCAServices(caInfo.url, { trustedRoots: caTLSCACerts, verify: false }, caInfo.caName);

	console.log(`Built a CA Client named ${caInfo.caName}`);
	return caClient;
};

exports.enrollAdmin = async (caClient, wallet, orgMspId) => {
	try {
		// Check to see if we've already enrolled the admin user.
		const identity = await wallet.get(adminUserId);
		if (identity) {
			console.log('An identity for the admin user already exists in the wallet');
			return;
		}

		// Enroll the admin user, and import the new identity into the wallet.
		const enrollment = await caClient.enroll({ enrollmentID: adminUserId, enrollmentSecret: adminUserPasswd });
		const x509Identity = {
			credentials: {
				certificate: enrollment.certificate,
				privateKey: enrollment.key.toBytes(),
			},
			mspId: orgMspId,
			type: 'X.509',
		};
		await wallet.put(adminUserId, x509Identity);
		console.log('Successfully enrolled admin user and imported it into the wallet');
	} catch (error) {
		console.error(`Failed to enroll admin user : ${error}`);
	}
};

exports.registerAndEnrollUser = async (caClient, wallet, orgMspId, userId, affiliation, attributeValue) => {
	try {
		// Check to see if we've already enrolled the user
		let userIdentity = await wallet.get(userId);
		if (userIdentity) {
			console.log(`An identity for the user ${userId} already exists in the wallet`);
			return;
		}

		//to allow multiple user of the same type
        /*let count = 1;
		let tempUser = userId;
		while(userIdentity){
			const { dept, org } = extractDeptOrgFromIdentity(userIdentity);
			console.log("*******************")
			console.log(dept)
			console.log(org)
			if(dept === attributeValue.dept && org === attributeValue.org){
				console.log(`An identity for the user ${userId} already exists in the wallet`);
				return;
			}
			userId = tempUser + (count).toString();
			userIdentity = await wallet.get(userId);
			count++;
		}*/

		// Must use an admin to register a new user
		const adminIdentity = await wallet.get(adminUserId);
		if (!adminIdentity) {
			console.log('An identity for the admin user does not exist in the wallet');
			console.log('Enroll the admin user before retrying');
			return;
		}

		// build a user object for authenticating with the CA
		const provider = wallet.getProviderRegistry().getProvider(adminIdentity.type);
		const adminUser = await provider.getUserContext(adminIdentity, adminUserId);

		// Register the user, enroll the user, and import the new identity into the wallet.
		// if affiliation is specified by client, the affiliation value must be configured in CA
		console.log('attribute Value: ',  `${attributeValue.dept}`)//`party1_${attributeValue}`
		const attributes = [{name: 'HF.name', value: `${attributeValue.name}`, ecert:true}, 
			{ name: 'HF.role', value: `${attributeValue.type}`, ecert: true },
			{name: 'department', value: `${attributeValue.dept}`, ecert:true},
		{name: 'organization', value: `${attributeValue.org}`, ecert:true}];
		


		const secret = await caClient.register({
			affiliation: affiliation,
			enrollmentID: userId,
			attrs: attributes, //used of access controll, it can have role(like admin, member) or specfifc charactricstic(like org,deprt, phone, emial)
			role: 'client', // optional: type of identity liek user, client, app, peer, orderer, etc
            caname: 'ca-org1'
		}, adminUser);
		const enrollment = await caClient.enroll({
			enrollmentID: userId,
			enrollmentSecret: secret
		});
		const x509Identity = {
			credentials: {
				certificate: enrollment.certificate,
				privateKey: enrollment.key.toBytes(),
			},
			mspId: orgMspId,
			type: 'X.509',
		};
		await wallet.put(userId, x509Identity);
		console.log('\nRegistered user attributes:', attributes);
		console.log(`Successfully registered and enrolled user ${userId} and imported it into the wallet`);
	} catch (error) {
		console.error(`Failed to register user : ${error}`);
	}
};

// register and enroll sensor
exports.registerAndEnrollSensor = async (caClient, wallet, orgMspId, sensorId, affiliation, sensorMeta) => {
    try {
        // Check if already enrolled
        const sensorIdentity = await wallet.get(sensorId);
        if (sensorIdentity) {
            console.log(`An identity for the sensor ${sensorId} already exists in the wallet`);
            return;
        }

        // Use admin for registering
        const adminIdentity = await wallet.get(adminUserId);
        if (!adminIdentity) throw new Error("Enroll admin first");

        const provider = wallet.getProviderRegistry().getProvider(adminIdentity.type);
        const adminUser = await provider.getUserContext(adminIdentity, adminUserId);

        // Register with CA (contractId removed, sensorType added)
        const attributes = [
            { name: 'HF.sensorId', value: `${sensorMeta.sensorId}`, ecert: true },
            { name: 'HF.role', value: 'sensor', ecert: true },
            { name: 'sensorType', value: `${sensorMeta.sensorType}`, ecert: true },
            { name: 'organization', value: sensorMeta.org || 'IoT Inc', ecert: true }
        ];

        const secret = await caClient.register({
            affiliation,
            enrollmentID: sensorId,
            attrs: attributes,
            role: 'client',
            caname: 'ca-org1'
        }, adminUser);

        const enrollment = await caClient.enroll({
            enrollmentID: sensorId,
            enrollmentSecret: secret
        });

        const x509Identity = {
            credentials: {
                certificate: enrollment.certificate,
                privateKey: enrollment.key.toBytes(),
            },
            mspId: orgMspId,
            type: 'X.509',
        };

        await wallet.put(sensorId, x509Identity);
        console.log(`✅ Registered and enrolled sensor ${sensorId} (${sensorMeta.sensorType})`);
    } catch (err) {
        console.error(`❌ Failed to register sensor ${sensorId}: ${err}`);
    }
};



// Function to build a Fabric CA client using static CA certificates
exports.buildStaticCAClient = (caURL, caTLSCert, caName) =>{
    // Create a new instance of FabricCAServices
    const caService = new FabricCAServices(caURL, { trustedRoots: caTLSCert, verify: false }, caName);

    // Return the Fabric CA client
    return caService;
};




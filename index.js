const mailgun = require( 'mailgun-js' )( { apiKey: process.env.MAILGUN_API_KEY, domain: process.env.MAILGUN_DOMAIN } );
const reduce = require( 'lodash/reduce' );
const map = require( 'lodash/map' );
const each = require( 'lodash/each' );
const clone = require( 'lodash/clone' );
const isInteger = require( 'lodash/isInteger' );
const isUndefined = require( 'lodash/isUndefined' );

const keyColors = {
	accepted: '#9bc0ab',
	delivered: '#629976',
	temporary: '#d9a8aa',
	permanent: '#b85555',
	complained: '#aa2d2c',
	unsubscribed: '#373f41',
	stored: '#bedafc',
	clicked: '#ea912e',
	opened: '#3770df',
};

function generateAttachments( totals ) {
	return map( totals, ( field, key ) => ( {
		color: keyColors[ key ] || '#3367d6',
		title: key,
		text: reduce( field, ( acc, count, fieldType ) => `${ acc }_${ fieldType }:_ ${ count }\n`, '' ),
	} ) );
}

const reduceField = ( mainAcc, fieldValue, fieldKey ) => {
	const root = clone( mainAcc[ fieldKey ] ) || {};

	each( fieldValue, ( value, key ) => {
		if ( isInteger( root[ key ] ) ) {
			root[ key ] += value;
		} else if ( isUndefined( root[ key ] ) ) {
			root[ key ] = value;
		}
	} );

	return root;
};

function aggregateTotals( mailgunStats ) {
	return reduce( mailgunStats, ( acc, stat ) => {
		each( stat, ( value, key ) => {
			if ( key === 'time' ) {
				return;
			}

			if ( key === 'failed' ) {
				acc.temporary = reduceField( acc, value.temporary, 'temporary' );
				acc.permanent = reduceField( acc, value.permanent, 'permanent' );
			} else {
				acc[ key ] = reduceField( acc, value, key );
			}
		} );

		return acc;
	}, {} );
}

/**
 * Format Mailgun body to Slack message
 *
 * @param {object} mailgunResponse The response from the mailgun
 * @returns {object} The formatted message.
 */
function formatSlackMessage( { stats: _stats, start, end } ) {
	const totals = aggregateTotals( _stats );
	const attachments = generateAttachments( totals );
	const range = start === end ? `for ${ start }` : `from ${ start } to ${ end }`;

	// Prepare a rich Slack message
	// See https://api.slack.com/docs/message-formatting
	const slackMessage = {
		response_type: 'in_channel',
		text: `Mailgun totals ${ range }`,
		attachments,
	};

	return slackMessage;
}

/**
 * Verify that the webhook request came from Slack.
 *
 * @param {object} body The body of the request.
 * @param {string} body.token The Slack token to be verified.
 */
function verifyWebhook( body ) {
	if ( ! body || body.token !== process.env.SLACK_TOKEN ) {
		const error = new Error( 'Invalid credentials' );
		error.code = 401;
		throw error;
	}
}

/**
 *  Is it a string? IS IT!?
 *
 * @param {*} str Param to test for string
 * @returns {boolean} Whether a string
 */
const isString = str => typeof str === 'string';

/**
 * Send the user's request to mailgun
 *
 * @param {object} slackBody The body sent in from slack
 * @returns {Promise} A promise
 */
function fetchStats( slackBody ) {
	const [ _duration, _event ] = slackBody.text.split( ' ' );

	const duration = isString( _duration ) && _duration;
	const event = isString( _event ) && _event.split( ',' );

	const payload = {
		duration: duration || '24h',
		event: event || [ 'accepted', 'delivered', 'failed' ],
	};

	return new Promise( ( resolve, reject ) => {
		mailgun.get( `/${ process.env.MAILGUN_DOMAIN }/stats/total`, payload, function( error, response ) {
			if ( error ) {
				return reject( error );
			}
			resolve( formatSlackMessage( response ) );
		} );
	} );
}

/**
 * Receive a Slash Command request from Slack.
 *
 * Trigger this function by making a POST request with a payload to:
 * https://[YOUR_REGION].[YOUR_PROJECT_ID].cloudfunctions.net/stats
 *
 * @example
 * curl -X POST "https://us-central1-spatial-cirrus-228901.cloudfunctions.net/promoter-mailgun-stats/stats" --data '{"token":"[YOUR_SLACK_TOKEN]","event":"accepted,failed", "duration": "1m"}'
 *
 * @param {object} req Cloud Function request object.
 * @param {object} req.body The request payload.
 * @param {string} req.body.token Slack's verification token.
 * @param {string} req.body.event The events used for stats
 * @param {string} req.body.duration The duration to get stats for
 * @param {object} res Cloud Function response object.
 * @returns {Promise} Resolved promise
 */
function stats( req, res ) {
	return Promise.resolve()
		.then( () => {
			if ( req.method !== 'POST' ) {
				const error = new Error( 'Only POST requests are accepted' );
				error.code = 405;
				throw error;
			}

			// Verify that this request came from Slack
			verifyWebhook( req.body );

			// Fetch stats from mailgun
			return fetchStats( req.body );
		} )
		.then( response => {
			// Send the formatted message back to Slack
			res.json( response );
		} )
		.catch( err => {
			console.error( err );
			res.status( err.code || 500 ).send( err );
			return Promise.reject( err );
		} );
}

exports.stats = stats;

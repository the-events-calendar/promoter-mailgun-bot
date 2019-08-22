# Promoter Mailgun Stats GCloud Function

## Integration with Slack

The slack app for this function is located at: https://api.slack.com/apps/AMKJDBHLL

It was created by following this tutorial: https://cloud.google.com/functions/docs/tutorials/slack

## Deploying to GCloud

First you'll need to login:
```sh
npx gcloud auth login
```
You'll be taken to a browser window, where you'll need to login to the GCloud account.

After logging in, deploy the app using the following command:
```sh
npx gcloud functions deploy promoter-mailgun-stats --runtime nodejs8 --trigger-http
```

The latest code should now be up.
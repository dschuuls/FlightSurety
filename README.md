# FlightSurety by Julian Knab

FlightSurety is a sample application project for Udacity's Blockchain course.

## Install

This repository contains Smart Contract code in Solidity (using Truffle), tests (also using Truffle), dApp (using HTML, CSS and JS) and server app.

To install, download or clone the repo, then:

`npm install`

## Unit Tests

To run airline and flight tests:

`npm run test`

For oracle tests start Ganache first:

`npm run ganache`

Then run oracle tests:

`npm run test:oracles`

## Deployment

Make sure Ganache is running.

Start if necessary:

`npm run ganache`

Then deploy:

`npm run deploy`

## Server

Make sure Ganache is running and everything is deployed.

Then start the server:

`npm run server`

## dApp

Make sure Ganache is running, everything is deployed and you started the server.

Then start the server for the dApp:

`npm run dapp`

...and visit

`http://localhost:8000`

in your browser.

The dApp is verbose in the console of the developer tools only.

Refresh the page after selecting another account in MetaMask.

## Other scripts

### Console

Will run the Truffle console:

`npm run console`

### Reset

Will delete the build and ganache-db folders:

`npm run reset`

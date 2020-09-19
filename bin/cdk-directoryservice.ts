#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { CdkDirectoryserviceStack } from '../lib/cdk-directoryservice-stack';

const app = new cdk.App();
new CdkDirectoryserviceStack(app, 'CdkDirectoryserviceStack', {
    directoryServiceName: "aurbac.kabits.com",
    directoryServiceShortName: "aurbackabits",
    directoryServicePasswordSecret: "directoryServicePassword"
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { assessOpportunity, scoreQualification } from '../src/opportunity.js';

test('turns observable website problems into a qualified sales opportunity', () => {
    const business = { name: 'Acme', website: 'http://acme.example', rating: 4.5, reviews: 20 };
    const contacts = {
        best_email: 'hello@acme.example',
        emails: [
            {
                value: 'hello@acme.example',
                same_domain: true,
                mx_valid: true,
            },
        ],
        phones: [],
    };
    const opportunity = assessOpportunity(
        business,
        contacts,
        {
            status: 'checked',
            secure_https: false,
            mobile_viewport: false,
            contact_form: false,
            booking_cta: false,
            outdated_copyright: true,
            page_title_present: true,
        },
        'website_redesign',
    );
    const qualification = scoreQualification(business, contacts, opportunity, {
        contactRequirement: 'verified_email',
        minimumLeadScore: 45,
    });

    assert.equal(opportunity.score, 100);
    assert.match(opportunity.summary, /https/i);
    assert.equal(qualification.is_qualified, true);
    assert.ok(qualification.score >= 45);
});

import '@unit/globals';
import Vue from 'vue';
import { mount, createLocalVue } from '@vue/test-utils';
import { expect } from 'chai';
import sinon from 'sinon';
import flushPromises from 'flush-promises';

import container from '@di';
import WelcomeView from '@/views/Welcome.vue';
import WelcomeViewPageObj from '@/views/Welcome.vue.po';
import { createStore, STORE_ID } from '@/store';
import { createRouter, ROUTER_ID } from '@/router';
import { PROFILE_SERVICE_ID } from '@/services/profile';
import { EMAIL_SERVICE_ID } from '@/services/email';

describe('Welcome view', function () {
  beforeEach(function () {
    this.localVue = createLocalVue();

    // store
    this.store = createStore(this.localVue);
    container.bind(STORE_ID).toConstantValue(this.store);

    // router
    this.router = createRouter(this.localVue);
    container.bind(ROUTER_ID).toConstantValue(this.router);

    // profile service
    this.profileService = {
      getProfile: sinon.stub().returnsPromise()
    };
    container.rebind(PROFILE_SERVICE_ID).toConstantValue(this.profileService);

    // email service
    this.emailService = {
      getEmails: sinon.stub().returnsPromise(),
      markEmailAsRead: sinon.stub().returnsPromise()
    };
    container.rebind(EMAIL_SERVICE_ID).toConstantValue(this.emailService);

    // mount fn
    this.mountWelcomeView = function (options) {
      let wrapper = mount(WelcomeView, { localVue: this.localVue, router: this.router, store: this.store, ...options });
      return new WelcomeViewPageObj(wrapper);
    };

    // set proper route
    let isAuthenticatedStub = sinon.stub().returns(true);
    this.store.mockGetter('auth/isAuthenticated', isAuthenticatedStub);
    this.router.push({ name: 'welcome' });

    return flushPromises();
  });

  afterEach(function () {
    this.store.restore();
  });

  it('should enter route', function () {
    expect(this.router.currentRoute.name).to.equal('welcome');
  });

  it('should mount without any errors', function () {
    this.mountWelcomeView();
    expect(console.error).not.to.have.been.called;
  });

  describe('while data have not been resolved yet', function () {
    it('should display loading progress', function () {
      this.welcomeView = this.mountWelcomeView();
      expect(this.welcomeView.loading.exists(), 'Should display loading indicator while waiting on data to resolve').to.be.true;
    });
  });

  describe('when all data have been loaded', function () {
    beforeEach(function () {
      this.randomProfile = { username: 'random_username' };
      this.profileService.getProfile.resolves(this.randomProfile);

      this.randomEmails = [
        { id: 1, subject: 'Random_subject', unread: true, sender: 'random1@sender.com', body: 'Random body 1' },
        { id: 2, subject: 'Random_subject', unread: false, sender: 'random2@sender.com', body: 'Random body 2' }
      ];
      this.emailService.getEmails.resolves(this.randomEmails);

      this.welcomeView = this.mountWelcomeView();
      return flushPromises();
    });

    it('should not display loading anymore', function () {
      expect(this.welcomeView.loading.exists(), 'Loading indicator should not be visible').to.be.false;
    });

    it('should display greeting', function () {
      expect(this.welcomeView.header.exists(), 'Should have header visible').to.be.true;
      expect(this.welcomeView.header.text(), 'Should display personal text in header').to.equal('Welcome random_username!');
    });

    it('should display emails in dashboard', function () {
      expect(this.welcomeView.dashboard.exists(), 'Should have dashboard visible').to.be.true;
      expect(this.welcomeView.dashboard.emailsSection.exists(), 'Should have emails section visible').to.be.true;
      expect(this.welcomeView.dashboard.emailsSection.header.exists(), 'Should have emails header visible').to.be.true;
      expect(this.welcomeView.dashboard.emailsSection.header.text(), 'Should display message about new emails').to.equal('You have 1 new emails:');
      expect(this.welcomeView.dashboard.emailsSection.list.exists(), 'Should have emails list visible').to.be.true;
      expect(this.welcomeView.dashboard.emailsSection.emails.length, 'Should have all emails visible').to.equal(this.randomEmails.length);

      this.randomEmails.forEach((randomEmail, index) => {
        let email = this.welcomeView.dashboard.emailsSection.getEmailByIndex(index);
        expect(email.subject.text(), `Should display subject for email with index ${index}`).to.equal(randomEmail.subject);
        expect(email.sender.text(), `Should display sender for email with index ${index}`).to.equal(`from ${randomEmail.sender}`);
        expect(email.body.text(), `Should create body for email with index ${index}`).to.equal(`${randomEmail.body}`);
        expect(email.isOpen(), `Should not display body for email with index ${index}`).to.be.false;
      });
    });

    describe('when user opens any email', function () {
      beforeEach(function () {
        this.emailService.markEmailAsRead.resolves({});

        this.emailToOpen = this.welcomeView.dashboard.emailsSection.getEmailByIndex(0);
        this.emailToOpen.open();
        return Vue.nextTick();
      });

      it('should open given email', function () {
        expect(this.emailToOpen.isOpen(), 'Email should open but it didn\'t.').to.be.true;
      });

      it('should mark the email as read', function () {
        expect(this.emailToOpen.isUnread(), 'Recently open email didn\'t get open').to.be.false;
      });

      describe('and then opens another email', function () {
        beforeEach(function () {
          this.nextEmailToOpen = this.welcomeView.dashboard.emailsSection.getEmailByIndex(1);
          this.nextEmailToOpen.open();
          return Vue.nextTick();
        });

        it('should open given email', function () {
          expect(this.nextEmailToOpen.isOpen(), 'Second email didn\'t get open').to.be.true;
        });

        it('should close previous open email', function () {
          expect(this.emailToOpen.isOpen(), 'Previous email didn\'t get closed').to.be.false;
        });
      });
    });

    describe('when there are no unread emails', function () {
      beforeEach(function () {
        this.randomEmails.forEach(email => { email.unread = false; });
        return Vue.nextTick();
      });

      it('should display message in header', function () {
        expect(this.welcomeView.dashboard.emailsSection.header.text(), 'Should display message about no emails').to.equal('You have no unread emails');
      });

      it('should display list of emails', function () {
        expect(this.welcomeView.dashboard.emailsSection.list.exists(), 'Should display emails list').to.be.true;
      });
    });
  });

  describe('when loading of profile failed with error', function () {
    beforeEach(function () {
      this.profileService.getProfile.rejects({ response: { data: { error: { message: 'Unexpected error while loading the profile' } } } });

      this.welcomeView = this.mountWelcomeView();
      return flushPromises();
    });

    it('should display error message', function () {
      expect(this.welcomeView.loadingError.exists(), 'Should have loading indicator visible').to.be.true;
      expect(this.welcomeView.loadingError.text()).to.equal('An error occurred: Unexpected error while loading the profile');
    });

    it('should not display loading indicator nor dashboard', function () {
      expect(this.welcomeView.loading.exists(), 'Should not have loading indicator visible').to.be.false;
      expect(this.welcomeView.header.exists(), 'Should not have header visible').to.be.false;
      expect(this.welcomeView.dashboard.exists(), 'Should not have dashboard visible').to.be.false;
    });
  });

  describe('when loading of emails failed with error', function () {
    beforeEach(function () {
      this.emailService.getEmails.rejects({ response: { data: { error: { message: 'Unexpected error while loading emails' } } } });

      this.welcomeView = this.mountWelcomeView();
      return flushPromises();
    });

    it('should display error message', function () {
      expect(this.welcomeView.loadingError.exists(), 'Should have loading indicator visible').to.be.true;
      expect(this.welcomeView.loadingError.text()).to.equal('An error occurred: Unexpected error while loading emails');
    });

    it('should not display loading indicator nor dashboard', function () {
      expect(this.welcomeView.loading.exists(), 'Should not have loading indicator visible').to.be.false;
      expect(this.welcomeView.header.exists(), 'Should not have header visible').to.be.false;
      expect(this.welcomeView.dashboard.exists(), 'Should not have dashboard visible').to.be.false;
    });
  });
});
